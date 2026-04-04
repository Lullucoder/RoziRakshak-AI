/**
 * Payout Service - Razorpay Test Mode Integration
 * Handles the complete payout lifecycle from initiation to webhook processing
 */

import { adminDb } from '@/lib/firebase-admin';
import admin from 'firebase-admin';
import type { Timestamp } from 'firebase-admin/firestore';
import { createHmac } from 'crypto';

const FieldValue = admin.firestore.FieldValue;
const TimestampValue = admin.firestore.Timestamp;

// Razorpay configuration
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const RAZORPAY_ACCOUNT_NUMBER = process.env.RAZORPAY_ACCOUNT_NUMBER || '';
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';
const RAZORPAY_API_URL = 'https://api.razorpay.com/v1';

/**
 * Payout document interface
 */
export interface PayoutDocument {
  id?: string;
  claim_id: string;
  worker_id: string;
  amount_inr: number;
  upi_id: string;
  razorpay_payout_id: string | null;
  razorpay_fund_account_id: string | null;
  razorpay_reference_id: string;
  status: 'processing' | 'paid' | 'failed' | 'demo';
  failure_reason: string | null;
  initiated_at: Timestamp;
  paid_at: Timestamp | null;
  notes: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/**
 * Razorpay fund account response
 */
interface RazorpayFundAccount {
  id: string;
  entity: string;
  contact_id: string;
  account_type: string;
  vpa: {
    address: string;
  };
  active: boolean;
  created_at: number;
}

/**
 * Razorpay payout response
 */
interface RazorpayPayout {
  id: string;
  entity: string;
  fund_account_id: string;
  amount: number;
  currency: string;
  status: string;
  purpose: string;
  utr: string | null;
  mode: string;
  reference_id: string;
  narration: string;
  created_at: number;
}

/**
 * 1. Initiate test payout via Razorpay
 */
export async function initiateTestPayout(
  claimId: string,
  workerId: string,
  amountInr: number,
  upiId: string
): Promise<string> {
  console.log('[Payout] Initiating test payout:', {
    claimId,
    workerId,
    amountInr,
    upiId
  });
  
  try {
    // Validate inputs
    if (!claimId || !workerId || !amountInr || !upiId) {
      throw new Error('Missing required parameters');
    }
    
    if (amountInr < 1) {
      throw new Error('Amount must be at least ₹1');
    }
    
    // Validate Razorpay credentials
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET || !RAZORPAY_ACCOUNT_NUMBER) {
      throw new Error('Razorpay credentials not configured');
    }
    
    // Get worker document
    const workerRef = adminDb.collection('workers').doc(workerId);
    const workerDoc = await workerRef.get();
    
    if (!workerDoc.exists) {
      throw new Error('Worker not found');
    }
    
    const worker = workerDoc.data()!;
    let fundAccountId = worker.razorpay_fund_account_id;
    
    // Step 1: Create or reuse fund account
    if (!fundAccountId || worker.upiId !== upiId) {
      console.log('[Payout] Creating new fund account for UPI:', upiId);
      fundAccountId = await createFundAccount(workerId, worker.name, upiId);
      
      // Store fund account ID on worker document
      await workerRef.update({
        razorpay_fund_account_id: fundAccountId,
        upiId: upiId,
        updated_at: Timestamp.now()
      });
      
      console.log('[Payout] Fund account created:', fundAccountId);
    } else {
      console.log('[Payout] Reusing existing fund account:', fundAccountId);
    }
    
    // Step 2: Create payout reference ID
    const referenceId = `claim_${claimId}_${Date.now()}`;
    
    // Step 3: Initiate payout via Razorpay
    const razorpayPayout = await createRazorpayPayout(
      fundAccountId,
      amountInr,
      referenceId,
      `RoziRakshak claim payout - ${claimId}`
    );
    
    console.log('[Payout] Razorpay payout created:', razorpayPayout.id);
    
    // Step 4: Write payout document to Firestore
    const payoutRef = adminDb.collection('payouts').doc();
    const payoutDoc: PayoutDocument = {
      claim_id: claimId,
      worker_id: workerId,
      amount_inr: amountInr,
      upi_id: upiId,
      razorpay_payout_id: razorpayPayout.id,
      razorpay_fund_account_id: fundAccountId,
      razorpay_reference_id: referenceId,
      status: 'processing',
      failure_reason: null,
      initiated_at: Timestamp.now(),
      paid_at: null,
      notes: null,
      created_at: Timestamp.now(),
      updated_at: Timestamp.now()
    };
    
    await payoutRef.set(payoutDoc);
    
    console.log('[Payout] Payout document created:', payoutRef.id);
    
    // Step 5: Update claim document with payout ID
    await adminDb.collection('claims').doc(claimId).update({
      payoutId: payoutRef.id,
      status: 'payout_initiated',
      updated_at: Timestamp.now()
    });
    
    console.log('[Payout] Claim updated with payout ID');
    
    return razorpayPayout.id;
    
  } catch (error: any) {
    console.error('[Payout] Failed to initiate payout:', {
      claimId,
      error: error.message,
      stack: error.stack
    });
    
    // Update claim status to payout_failed
    try {
      await adminDb.collection('claims').doc(claimId).update({
        status: 'payout_failed',
        holdReason: `Payout initiation failed: ${error.message}`,
        updated_at: Timestamp.now()
      });
    } catch (updateError) {
      console.error('[Payout] Failed to update claim status:', updateError);
    }
    
    throw error;
  }
}

/**
 * Create Razorpay fund account for UPI
 */
async function createFundAccount(
  workerId: string,
  workerName: string,
  upiId: string
): Promise<string> {
  try {
    // Step 1: Create contact
    const contactResponse = await fetch(`${RAZORPAY_API_URL}/contacts`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: workerName,
        email: `${workerId}@rozirakshak.ai`,
        contact: '9999999999', // Dummy contact for test mode
        type: 'employee',
        reference_id: workerId
      })
    });
    
    if (!contactResponse.ok) {
      const error = await contactResponse.json();
      throw new Error(`Failed to create contact: ${error.error?.description || 'Unknown error'}`);
    }
    
    const contact = await contactResponse.json();
    console.log('[Payout] Contact created:', contact.id);
    
    // Step 2: Create fund account
    const fundAccountResponse = await fetch(`${RAZORPAY_API_URL}/fund_accounts`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contact_id: contact.id,
        account_type: 'vpa',
        vpa: {
          address: upiId
        }
      })
    });
    
    if (!fundAccountResponse.ok) {
      const error = await fundAccountResponse.json();
      throw new Error(`Failed to create fund account: ${error.error?.description || 'Unknown error'}`);
    }
    
    const fundAccount: RazorpayFundAccount = await fundAccountResponse.json();
    console.log('[Payout] Fund account created:', fundAccount.id);
    
    return fundAccount.id;
    
  } catch (error: any) {
    console.error('[Payout] Failed to create fund account:', error.message);
    throw error;
  }
}

/**
 * Create Razorpay payout
 */
async function createRazorpayPayout(
  fundAccountId: string,
  amountInr: number,
  referenceId: string,
  narration: string
): Promise<RazorpayPayout> {
  try {
    const response = await fetch(`${RAZORPAY_API_URL}/payouts`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        account_number: RAZORPAY_ACCOUNT_NUMBER,
        fund_account_id: fundAccountId,
        amount: amountInr * 100, // Convert to paise
        currency: 'INR',
        mode: 'UPI',
        purpose: 'payout',
        queue_if_low_balance: true,
        reference_id: referenceId,
        narration: narration
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Razorpay payout failed: ${error.error?.description || 'Unknown error'}`);
    }
    
    const payout: RazorpayPayout = await response.json();
    return payout;
    
  } catch (error: any) {
    console.error('[Payout] Failed to create Razorpay payout:', error.message);
    throw error;
  }
}

/**
 * 2. Handle Razorpay webhook
 */
export async function handlePayoutWebhook(
  razorpayPayload: any,
  signature: string
): Promise<any> {
  console.log('[Payout Webhook] Processing webhook:', {
    event: razorpayPayload.event,
    payoutId: razorpayPayload.payload?.payout?.entity?.id
  });
  
  try {
    // Step 1: Verify signature
    if (!verifyWebhookSignature(razorpayPayload, signature)) {
      throw new Error('Invalid webhook signature');
    }
    
    console.log('[Payout Webhook] Signature verified');
    
    // Step 2: Extract event data
    const event = razorpayPayload.event;
    const payoutData = razorpayPayload.payload?.payout?.entity;
    
    if (!payoutData) {
      throw new Error('Missing payout data in webhook');
    }
    
    const razorpayPayoutId = payoutData.id;
    
    // Step 3: Find payout document
    const payoutsSnapshot = await adminDb
      .collection('payouts')
      .where('razorpay_payout_id', '==', razorpayPayoutId)
      .limit(1)
      .get();
    
    if (payoutsSnapshot.empty) {
      console.warn('[Payout Webhook] Payout not found:', razorpayPayoutId);
      throw new Error('Payout not found');
    }
    
    const payoutDoc = payoutsSnapshot.docs[0];
    const payout = payoutDoc.data() as PayoutDocument;
    const payoutId = payoutDoc.id;
    
    console.log('[Payout Webhook] Payout found:', {
      payoutId,
      claimId: payout.claim_id,
      event
    });
    
    // Step 4: Handle different event types
    let updatedClaim = null;
    
    switch (event) {
      case 'payout.processed':
        updatedClaim = await handlePayoutProcessed(payoutId, payout, payoutData);
        break;
      
      case 'payout.failed':
        updatedClaim = await handlePayoutFailed(payoutId, payout, payoutData);
        break;
      
      case 'payout.reversed':
        updatedClaim = await handlePayoutReversed(payoutId, payout, payoutData);
        break;
      
      default:
        console.log('[Payout Webhook] Unhandled event type:', event);
    }
    
    return updatedClaim;
    
  } catch (error: any) {
    console.error('[Payout Webhook] Error processing webhook:', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Verify Razorpay webhook signature
 */
function verifyWebhookSignature(payload: any, signature: string): boolean {
  try {
    if (!RAZORPAY_WEBHOOK_SECRET) {
      console.warn('[Payout Webhook] Webhook secret not configured, skipping verification');
      return true; // Allow in development
    }
    
    const expectedSignature = createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
      .update(JSON.stringify(payload))
      .digest('hex');
    
    return signature === expectedSignature;
    
  } catch (error: any) {
    console.error('[Payout Webhook] Signature verification failed:', error.message);
    return false;
  }
}

/**
 * Handle payout.processed event
 */
async function handlePayoutProcessed(
  payoutId: string,
  payout: PayoutDocument,
  payoutData: any
): Promise<any> {
  console.log('[Payout Webhook] Processing payout.processed:', payoutId);
  
  try {
    const now = Timestamp.now();
    
    // Update payout document
    await adminDb.collection('payouts').doc(payoutId).update({
      status: 'paid',
      paid_at: now,
      updated_at: now
    });
    
    console.log('[Payout Webhook] Payout document updated to paid');
    
    // Update claim document
    const claimRef = adminDb.collection('claims').doc(payout.claim_id);
    await claimRef.update({
      status: 'paid',
      resolvedAt: now,
      updated_at: now
    });
    
    console.log('[Payout Webhook] Claim document updated to paid');
    
    // Update worker's payout history
    const workerRef = adminDb.collection('workers').doc(payout.worker_id);
    await workerRef.update({
      payout_history: adminDb.FieldValue.arrayUnion({
        claim_id: payout.claim_id,
        amount_inr: payout.amount_inr,
        paid_at: now,
        razorpay_payout_id: payout.razorpay_payout_id
      }),
      total_payouts_received: adminDb.FieldValue.increment(payout.amount_inr),
      updated_at: now
    });
    
    console.log('[Payout Webhook] Worker payout history updated');
    
    // Return updated claim
    const claimDoc = await claimRef.get();
    return claimDoc.data();
    
  } catch (error: any) {
    console.error('[Payout Webhook] Failed to process payout.processed:', error.message);
    throw error;
  }
}

/**
 * Handle payout.failed event
 */
async function handlePayoutFailed(
  payoutId: string,
  payout: PayoutDocument,
  payoutData: any
): Promise<any> {
  console.log('[Payout Webhook] Processing payout.failed:', payoutId);
  
  try {
    const now = Timestamp.now();
    const failureReason = payoutData.failure_reason || 'Unknown failure';
    
    // Update payout document
    await adminDb.collection('payouts').doc(payoutId).update({
      status: 'failed',
      failure_reason: failureReason,
      updated_at: now
    });
    
    console.log('[Payout Webhook] Payout document updated to failed');
    
    // Update claim document
    const claimRef = adminDb.collection('claims').doc(payout.claim_id);
    await claimRef.update({
      status: 'payout_failed',
      holdReason: `Payout failed: ${failureReason}`,
      updated_at: now
    });
    
    console.log('[Payout Webhook] Claim document updated to payout_failed');
    
    // Return updated claim
    const claimDoc = await claimRef.get();
    return claimDoc.data();
    
  } catch (error: any) {
    console.error('[Payout Webhook] Failed to process payout.failed:', error.message);
    throw error;
  }
}

/**
 * Handle payout.reversed event
 */
async function handlePayoutReversed(
  payoutId: string,
  payout: PayoutDocument,
  payoutData: any
): Promise<any> {
  console.log('[Payout Webhook] Processing payout.reversed:', payoutId);
  
  try {
    const now = Timestamp.now();
    
    // Update payout document
    await adminDb.collection('payouts').doc(payoutId).update({
      status: 'failed',
      failure_reason: 'Payout was reversed',
      updated_at: now
    });
    
    console.log('[Payout Webhook] Payout document updated to failed (reversed)');
    
    // Update claim document
    const claimRef = adminDb.collection('claims').doc(payout.claim_id);
    await claimRef.update({
      status: 'approved', // Revert to approved
      payoutId: null,
      holdReason: 'Payout was reversed, please contact support',
      updated_at: now
    });
    
    console.log('[Payout Webhook] Claim document reverted to approved');
    
    // Return updated claim
    const claimDoc = await claimRef.get();
    return claimDoc.data();
    
  } catch (error: any) {
    console.error('[Payout Webhook] Failed to process payout.reversed:', error.message);
    throw error;
  }
}

/**
 * 3. Simulate instant payout (demo only)
 */
export async function simulateInstantPayout(
  claimId: string,
  workerId: string,
  amountInr: number
): Promise<any> {
  console.log('[Payout] Simulating instant payout (DEMO):', {
    claimId,
    workerId,
    amountInr
  });
  
  try {
    const now = Timestamp.now();
    
    // Create demo payout document
    const payoutRef = adminDb.collection('payouts').doc();
    const payoutDoc: PayoutDocument = {
      claim_id: claimId,
      worker_id: workerId,
      amount_inr: amountInr,
      upi_id: 'demo@upi',
      razorpay_payout_id: null,
      razorpay_fund_account_id: null,
      razorpay_reference_id: `demo_${claimId}_${Date.now()}`,
      status: 'demo',
      failure_reason: null,
      initiated_at: now,
      paid_at: now,
      notes: 'Demo simulation — not a real payment',
      created_at: now,
      updated_at: now
    };
    
    await payoutRef.set(payoutDoc);
    
    console.log('[Payout] Demo payout document created:', payoutRef.id);
    
    // Update claim document
    const claimRef = adminDb.collection('claims').doc(claimId);
    await claimRef.update({
      payoutId: payoutRef.id,
      status: 'paid',
      resolvedAt: now,
      updated_at: now
    });
    
    console.log('[Payout] Claim updated to paid (demo)');
    
    // Update worker's payout history
    const workerRef = adminDb.collection('workers').doc(workerId);
    await workerRef.update({
      payout_history: adminDb.FieldValue.arrayUnion({
        claim_id: claimId,
        amount_inr: amountInr,
        paid_at: now,
        demo: true
      }),
      total_payouts_received: adminDb.FieldValue.increment(amountInr),
      updated_at: now
    });
    
    console.log('[Payout] Worker payout history updated (demo)');
    
    // Return updated claim
    const claimDoc = await claimRef.get();
    return {
      success: true,
      claim: claimDoc.data(),
      payout_id: payoutRef.id,
      demo: true,
      message: 'Demo payout simulated successfully'
    };
    
  } catch (error: any) {
    console.error('[Payout] Failed to simulate instant payout:', {
      claimId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}
