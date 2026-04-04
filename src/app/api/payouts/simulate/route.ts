/**
 * Simulate Payout API Route (Demo Only)
 * POST /api/payouts/simulate
 * 
 * Simulates an instant payout without calling Razorpay
 * For demo and testing purposes only
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { simulateInstantPayout } from '@/lib/payout';

/**
 * POST /api/payouts/simulate
 * 
 * Request body:
 * {
 *   claim_id: string;
 *   worker_id: string;
 *   amount_inr: number;
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
      console.error('[Payout Simulate] Token verification failed:', error.message);
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Invalid or expired token' },
        { status: 401 }
      );
    }
    
    // Step 2: Check if user is admin (optional - for production)
    // For demo, we'll allow any authenticated user
    console.log('[Payout Simulate] Demo payout requested by:', decodedToken.uid);
    
    // Step 3: Parse request body
    const body = await request.json();
    const { claim_id, worker_id, amount_inr } = body;
    
    console.log('[Payout Simulate] Request:', {
      claim_id,
      worker_id,
      amount_inr
    });
    
    // Step 4: Validate inputs
    if (!claim_id || !worker_id || !amount_inr) {
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
    
    // Step 5: Verify claim exists
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
    
    // Step 6: Simulate instant payout
    console.log('[Payout Simulate] Simulating instant payout (DEMO)');
    
    const result = await simulateInstantPayout(
      claim_id,
      worker_id,
      amount_inr
    );
    
    console.log('[Payout Simulate] Demo payout completed:', result.payout_id);
    
    // Step 7: Return success response
    return NextResponse.json({
      success: true,
      message: 'Demo payout simulated successfully',
      demo: true,
      payout_id: result.payout_id,
      claim_id,
      worker_id,
      amount_inr,
      status: 'paid',
      note: 'This is a demo simulation — not a real payment'
    }, { status: 200 });
    
  } catch (error: any) {
    console.error('[Payout Simulate] Error:', {
      message: error.message,
      stack: error.stack
    });
    
    return NextResponse.json(
      { 
        error: 'Internal Server Error', 
        message: error.message || 'Failed to simulate payout' 
      },
      { status: 500 }
    );
  }
}
