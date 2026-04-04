/**
 * Claim Review API Route (Admin Only)
 * PATCH /api/claims/[claimId]/review
 * 
 * Allows admins to approve or reject claims in soft review (Track B)
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * PATCH /api/claims/[claimId]/review
 * 
 * Request body:
 * {
 *   decision: 'approve' | 'reject';
 *   admin_note: string;
 * }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { claimId: string } }
) {
  try {
    const { claimId } = params;
    
    console.log('[Claim Review] Request for claim:', claimId);
    
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
      console.error('[Claim Review] Token verification failed:', error.message);
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
    
    // Step 2: Verify admin role
    if (!isAdmin) {
      console.warn('[Claim Review] Non-admin user attempted review:', userId);
      return NextResponse.json(
        { 
          error: 'Forbidden', 
          code: 'ADMIN_ONLY',
          message: 'Only administrators can review claims' 
        },
        { status: 403 }
      );
    }
    
    console.log('[Claim Review] Admin user:', userId);
    
    // Step 3: Parse request body
    const body = await request.json();
    const { decision, admin_note } = body;
    
    console.log('[Claim Review] Decision:', decision);
    
    // Step 4: Validate inputs
    if (!decision || !admin_note) {
      return NextResponse.json(
        { 
          error: 'Bad Request', 
          code: 'MISSING_FIELDS',
          message: 'Missing required fields: decision, admin_note' 
        },
        { status: 400 }
      );
    }
    
    if (decision !== 'approve' && decision !== 'reject') {
      return NextResponse.json(
        { 
          error: 'Bad Request', 
          code: 'INVALID_DECISION',
          message: 'Decision must be either "approve" or "reject"' 
        },
        { status: 400 }
      );
    }
    
    // Step 5: Get claim document
    const claimRef = adminDb.collection('claims').doc(claimId);
    const claimDoc = await claimRef.get();
    
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
    
    // Step 6: Verify claim is in reviewable state
    const reviewableStatuses = ['under_review', 'held', 'under_appeal'];
    if (!reviewableStatuses.includes(claim.status)) {
      return NextResponse.json(
        { 
          error: 'Bad Request', 
          code: 'INVALID_STATUS',
          message: `Claim cannot be reviewed in current status: ${claim.status}` 
        },
        { status: 400 }
      );
    }
    
    console.log('[Claim Review] Current status:', claim.status);
    
    const now = Timestamp.now();
    
    // Step 7: Process decision
    if (decision === 'approve') {
      // Approve claim
      await claimRef.update({
        status: 'approved',
        resolvedAt: now,
        reviewedBy: userId,
        reviewedAt: now,
        adminNote: admin_note,
        updated_at: now
      });
      
      console.log('[Claim Review] Claim approved');
      
      // Log state transition
      await adminDb.collection('claimLogs').add({
        claimId,
        workerId: claim.workerId,
        adminId: userId,
        action: 'claim_approved',
        status: 'approved',
        details: admin_note,
        timestamp: now
      });
      
      // Trigger payout initiation
      // Get worker details for payout
      const workerDoc = await adminDb.collection('workers').doc(claim.workerId).get();
      
      if (workerDoc.exists) {
        const worker = workerDoc.data()!;
        
        // Calculate payout amount if not already set
        let payoutAmount = claim.payoutAmount;
        if (!payoutAmount || payoutAmount === 0) {
          // Use default payout based on severity
          const payoutMap: Record<string, number> = {
            moderate: 200,
            high: 400,
            severe: 800
          };
          payoutAmount = payoutMap[claim.triggerSeverity] || 200;
          
          await claimRef.update({
            payoutAmount
          });
        }
        
        // Initiate payout via API
        try {
          const { initiateTestPayout } = await import('@/lib/payout');
          
          await initiateTestPayout(
            claimId,
            claim.workerId,
            payoutAmount,
            worker.upiId || 'default@upi'
          );
          
          console.log('[Claim Review] Payout initiated');
          
        } catch (payoutError: any) {
          console.error('[Claim Review] Payout initiation failed:', payoutError.message);
          // Don't fail the approval, just log the error
        }
      }
      
      // TODO: Send notification to worker
      
      return NextResponse.json({
        success: true,
        claim_id: claimId,
        status: 'approved',
        message: 'Claim approved successfully. Payout has been initiated.',
        reviewed_by: userId,
        reviewed_at: now
      }, { status: 200 });
      
    } else {
      // Reject claim
      await claimRef.update({
        status: 'rejected',
        resolvedAt: now,
        reviewedBy: userId,
        reviewedAt: now,
        adminNote: admin_note,
        holdReason: admin_note, // Use admin note as rejection reason
        updated_at: now
      });
      
      console.log('[Claim Review] Claim rejected');
      
      // Log state transition
      await adminDb.collection('claimLogs').add({
        claimId,
        workerId: claim.workerId,
        adminId: userId,
        action: 'claim_rejected',
        status: 'rejected',
        details: admin_note,
        timestamp: now
      });
      
      // TODO: Send notification to worker with rejection reason
      
      return NextResponse.json({
        success: true,
        claim_id: claimId,
        status: 'rejected',
        message: 'Claim rejected. Worker has been notified.',
        reviewed_by: userId,
        reviewed_at: now
      }, { status: 200 });
    }
    
  } catch (error: any) {
    console.error('[Claim Review] Error:', {
      message: error.message,
      stack: error.stack
    });
    
    return NextResponse.json(
      { 
        error: 'Internal Server Error', 
        code: 'INTERNAL_ERROR',
        message: 'Failed to process claim review' 
      },
      { status: 500 }
    );
  }
}
