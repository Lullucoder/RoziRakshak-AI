/**
 * Payout Initiation API Route
 * POST /api/payouts/initiate
 * 
 * Initiates a payout via Razorpay test mode
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { initiateTestPayout } from '@/lib/payout';

/**
 * POST /api/payouts/initiate
 * 
 * Request body:
 * {
 *   claim_id: string;
 *   worker_id: string;
 *   amount_inr: number;
 *   upi_id: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Step 1: Authenticate request
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }
    
    const idToken = authHeader.split('Bearer ')[1];
    
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (error: any) {
      console.error('[Payout Initiate] Token verification failed:', error.message);
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Invalid or expired token' },
        { status: 401 }
      );
    }
    
    // Step 2: Parse request body
    const body = await request.json();
    const { claim_id, worker_id, amount_inr, upi_id } = body;
    
    console.log('[Payout Initiate] Request:', {
      claim_id,
      worker_id,
      amount_inr,
      upi_id,
      requestedBy: decodedToken.uid
    });
    
    // Step 3: Validate inputs
    if (!claim_id || !worker_id || !amount_inr || !upi_id) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    if (typeof amount_inr !== 'number' || amount_inr < 1) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Amount must be at least ₹1' },
        { status: 400 }
      );
    }
    
    // Step 4: Verify claim exists and is approved
    const claimDoc = await adminDb.collection('claims').doc(claim_id).get();
    
    if (!claimDoc.exists) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Claim not found' },
        { status: 404 }
      );
    }
    
    const claim = claimDoc.data()!;
    
    // Check if claim is approved
    if (claim.status !== 'auto_approved' && claim.status !== 'approved') {
      return NextResponse.json(
        { 
          error: 'Bad Request', 
          message: `Claim must be approved before payout. Current status: ${claim.status}` 
        },
        { status: 400 }
      );
    }
    
    // Check if payout already initiated
    if (claim.payoutId) {
      return NextResponse.json(
        { 
          error: 'Bad Request', 
          message: 'Payout already initiated for this claim' 
        },
        { status: 400 }
      );
    }
    
    // Step 5: Verify worker exists
    const workerDoc = await adminDb.collection('workers').doc(worker_id).get();
    
    if (!workerDoc.exists) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Worker not found' },
        { status: 404 }
      );
    }
    
    // Step 6: Initiate payout
    console.log('[Payout Initiate] Initiating payout via Razorpay');
    
    const razorpayPayoutId = await initiateTestPayout(
      claim_id,
      worker_id,
      amount_inr,
      upi_id
    );
    
    console.log('[Payout Initiate] Payout initiated successfully:', razorpayPayoutId);
    
    // Step 7: Return success response
    return NextResponse.json({
      success: true,
      message: 'Payout initiated successfully',
      razorpay_payout_id: razorpayPayoutId,
      claim_id,
      worker_id,
      amount_inr,
      status: 'processing'
    }, { status: 200 });
    
  } catch (error: any) {
    console.error('[Payout Initiate] Error:', {
      message: error.message,
      stack: error.stack
    });
    
    return NextResponse.json(
      { 
        error: 'Internal Server Error', 
        message: error.message || 'Failed to initiate payout' 
      },
      { status: 500 }
    );
  }
}
