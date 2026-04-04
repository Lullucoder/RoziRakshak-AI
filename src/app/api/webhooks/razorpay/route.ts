/**
 * Razorpay Webhook Handler
 * Processes payout status updates from Razorpay
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { adminDb as db } from '@/lib/firebase-admin';
import admin from 'firebase-admin';
const { Timestamp } = admin.firestore;

/**
 * POST /api/webhooks/razorpay
 * Handles Razorpay webhook events
 */
export async function POST(request: NextRequest) {
  try {
    // Get webhook signature from headers
    const signature = request.headers.get('x-razorpay-signature');
    
    if (!signature) {
      console.error('[Razorpay Webhook] Missing signature header');
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 401 }
      );
    }
    
    // Get request body
    const body = await request.text();
    const payload = JSON.parse(body);
    
    // Verify webhook signature
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.error('[Razorpay Webhook] Webhook secret not configured');
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500 }
      );
    }
    
    const expectedSignature = createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');
    
    if (signature !== expectedSignature) {
      console.error('[Razorpay Webhook] Invalid signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }
    
    // Log webhook event
    console.log('[Razorpay Webhook] Event received:', {
      event: payload.event,
      payoutId: payload.payload?.payout?.entity?.id,
      status: payload.payload?.payout?.entity?.status
    });
    
    // Process webhook event
    const event = payload.event;
    const payoutData = payload.payload?.payout?.entity;
    
    if (!payoutData) {
      console.error('[Razorpay Webhook] Missing payout data');
      return NextResponse.json(
        { error: 'Missing payout data' },
        { status: 400 }
      );
    }
    
    const razorpayPayoutId = payoutData.id;
    
    // Find payout document by Razorpay payout ID
    const payoutsSnapshot = await db
      .collection('payouts')
      .where('razorpayPayoutId', '==', razorpayPayoutId)
      .limit(1)
      .get();
    
    if (payoutsSnapshot.empty) {
      console.error('[Razorpay Webhook] Payout not found:', razorpayPayoutId);
      return NextResponse.json(
        { error: 'Payout not found' },
        { status: 404 }
      );
    }
    
    const payoutDoc = payoutsSnapshot.docs[0];
    const payoutId = payoutDoc.id;
    const payout = payoutDoc.data();
    
    // Handle different event types
    switch (event) {
      case 'payout.processed':
        await handlePayoutProcessed(payoutId, payout, payoutData);
        break;
      
      case 'payout.failed':
        await handlePayoutFailed(payoutId, payout, payoutData);
        break;
      
      case 'payout.reversed':
        await handlePayoutReversed(payoutId, payout, payoutData);
        break;
      
      default:
        console.log('[Razorpay Webhook] Unhandled event type:', event);
    }
    
    return NextResponse.json({ success: true });
    
  } catch (error: any) {
    console.error('[Razorpay Webhook] Error processing webhook:', {
      message: error.message,
      stack: error.stack
    });
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Handle payout.processed event
 */
async function handlePayoutProcessed(
  payoutId: string,
  payout: any,
  payoutData: any
): Promise<void> {
  console.log('[Razorpay Webhook] Processing payout.processed:', payoutId);
  
  // Update payout status
  await db.collection('payouts').doc(payoutId).update({
    status: 'completed',
    paidAt: Timestamp.now()
  });
  
  // Update claim status
  if (payout.claimId) {
    await db.collection('claims').doc(payout.claimId).update({
      status: 'paid',
      resolvedAt: Timestamp.now()
    });
  }
  
  // TODO: Update WeeklyCoverage totalPaidOut (Task 14.4)
  // TODO: Send success notification to worker (Task 16)
  
  console.log('[Razorpay Webhook] Payout processed successfully:', payoutId);
}

/**
 * Handle payout.failed event
 */
async function handlePayoutFailed(
  payoutId: string,
  payout: any,
  payoutData: any
): Promise<void> {
  console.log('[Razorpay Webhook] Processing payout.failed:', payoutId);
  
  const failureReason = payoutData.failure_reason || 'Unknown failure';
  
  // Update payout status
  await db.collection('payouts').doc(payoutId).update({
    status: 'failed',
    failureReason
  });
  
  // TODO: Send failure notification to worker (Task 16)
  // TODO: Schedule retry (Task 14.3)
  
  console.log('[Razorpay Webhook] Payout failed:', payoutId, failureReason);
}

/**
 * Handle payout.reversed event
 */
async function handlePayoutReversed(
  payoutId: string,
  payout: any,
  payoutData: any
): Promise<void> {
  console.log('[Razorpay Webhook] Processing payout.reversed:', payoutId);
  
  // Update payout status
  await db.collection('payouts').doc(payoutId).update({
    status: 'reversed',
    failureReason: 'Payout was reversed'
  });
  
  // Update claim status back to approved
  if (payout.claimId) {
    await db.collection('claims').doc(payout.claimId).update({
      status: 'approved',
      payoutId: null
    });
  }
  
  // TODO: Send notification to worker (Task 16)
  
  console.log('[Razorpay Webhook] Payout reversed:', payoutId);
}
