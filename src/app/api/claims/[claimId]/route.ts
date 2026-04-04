/**
 * Claim Details API Route
 * GET /api/claims/[claimId]
 * 
 * Returns full claim details with authorization checks
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

/**
 * GET /api/claims/[claimId]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { claimId: string } }
) {
  try {
    const { claimId } = params;
    
    console.log('[Claim Details] Request for claim:', claimId);
    
    // Step 1: Authenticate request
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { 
          error: 'Unauthorized', 
          code: 'AUTH_REQUIRED',
          message: 'Missing or invalid authorization header' 
        },
        { status: 401 }
      );
    }
    
    const idToken = authHeader.split('Bearer ')[1];
    
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (error: any) {
      console.error('[Claim Details] Token verification failed:', error.message);
      return NextResponse.json(
        { 
          error: 'Unauthorized', 
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired token' 
        },
        { status: 401 }
      );
    }
    
    const userId = decodedToken.uid;
    const isAdmin = decodedToken.admin === true || decodedToken.role === 'admin';
    
    console.log('[Claim Details] User:', userId, 'Admin:', isAdmin);
    
    // Step 2: Get claim document
    const claimDoc = await adminDb.collection('claims').doc(claimId).get();
    
    if (!claimDoc.exists) {
      return NextResponse.json(
        { 
          error: 'Not Found', 
          code: 'CLAIM_NOT_FOUND',
          message: 'Claim not found' 
        },
        { status: 404 }
      );
    }
    
    const claim = claimDoc.data()!;
    
    // Step 3: Authorization check
    // Workers can only view their own claims, admins can view any
    if (!isAdmin && claim.workerId !== userId) {
      return NextResponse.json(
        { 
          error: 'Forbidden', 
          code: 'ACCESS_DENIED',
          message: 'You do not have permission to view this claim' 
        },
        { status: 403 }
      );
    }
    
    console.log('[Claim Details] Authorization passed');
    
    // Step 4: Get linked payout if exists
    let payout = null;
    if (claim.payoutId) {
      const payoutDoc = await adminDb.collection('payouts').doc(claim.payoutId).get();
      if (payoutDoc.exists) {
        payout = {
          id: payoutDoc.id,
          ...payoutDoc.data()
        };
      }
    }
    
    // Step 5: Prepare response based on user role
    let responseData: any = {
      id: claimId,
      workerId: claim.workerId,
      workerName: claim.workerName,
      policyId: claim.policyId,
      triggerType: claim.triggerType,
      triggerSeverity: claim.triggerSeverity,
      zone: claim.zone,
      city: claim.city,
      description: claim.description,
      status: claim.status,
      confidenceScore: claim.confidenceScore,
      payoutAmount: claim.payoutAmount,
      payoutId: claim.payoutId,
      resolvedAt: claim.resolvedAt,
      decisionTrack: claim.decisionTrack,
      holdReason: claim.holdReason,
      appealSubmitted: claim.appealSubmitted,
      appealText: claim.appealText,
      appealedAt: claim.appealedAt,
      manuallyInitiated: claim.manuallyInitiated || false,
      createdAt: claim.createdAt,
      updatedAt: claim.updatedAt
    };
    
    // Include payout details if exists
    if (payout) {
      responseData.payout = {
        id: payout.id,
        amount_inr: payout.amount_inr,
        status: payout.status,
        upi_id: payout.upi_id,
        initiated_at: payout.initiated_at,
        paid_at: payout.paid_at,
        failure_reason: payout.failure_reason,
        notes: payout.notes
      };
    }
    
    // Admin-only fields: fraud details and internal scores
    if (isAdmin) {
      responseData.fraud_result = {
        fraudScore: claim.fraudScore,
        fraudRiskLevel: claim.fraudRiskLevel,
        fraudSignalIds: claim.fraudSignalIds,
        topContributingFeatures: claim.topContributingFeatures
      };
      
      // Include full payout details for admin
      if (payout) {
        responseData.payout.razorpay_payout_id = payout.razorpay_payout_id;
        responseData.payout.razorpay_fund_account_id = payout.razorpay_fund_account_id;
        responseData.payout.razorpay_reference_id = payout.razorpay_reference_id;
      }
    }
    
    console.log('[Claim Details] Returning claim data');
    
    return NextResponse.json(responseData, { status: 200 });
    
  } catch (error: any) {
    console.error('[Claim Details] Error:', {
      message: error.message,
      stack: error.stack
    });
    
    return NextResponse.json(
      { 
        error: 'Internal Server Error', 
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch claim details' 
      },
      { status: 500 }
    );
  }
}
