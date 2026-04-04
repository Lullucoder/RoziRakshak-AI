/**
 * Claim Appeal API Route (Worker Only)
 * POST /api/claims/[claimId]/appeal
 * 
 * Allows workers to appeal held claims (Track C)
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import admin from 'firebase-admin';
const { Timestamp } = admin.firestore;

/**
 * POST /api/claims/[claimId]/appeal
 * 
 * Request body:
 * {
 *   reason: string;
 *   additional_context: string;
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ claimId: string }> }
) {
  try {
    const { claimId } = await params;
    
    console.log('[Claim Appeal] Request for claim:', claimId);
    
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
      console.error('[Claim Appeal] Token verification failed:', error.message);
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
    
    console.log('[Claim Appeal] User:', userId);
    
    // Step 2: Parse request body
    const body = await request.json();
    const { reason, additional_context } = body;
    
    console.log('[Claim Appeal] Appeal reason provided');
    
    // Step 3: Validate inputs
    if (!reason || !additional_context) {
      return NextResponse.json(
        { 
          error: 'Bad Request', 
          code: 'MISSING_FIELDS',
          message: 'Missing required fields: reason, additional_context' 
        },
        { status: 400 }
      );
    }
    
    if (reason.length < 10) {
      return NextResponse.json(
        { 
          error: 'Bad Request', 
          code: 'REASON_TOO_SHORT',
          message: 'Appeal reason must be at least 10 characters' 
        },
        { status: 400 }
      );
    }
    
    // Step 4: Get claim document
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
    
    // Step 5: Authorization check - worker can only appeal their own claims
    if (!isAdmin && claim.workerId !== userId) {
      return NextResponse.json(
        { 
          error: 'Forbidden', 
          code: 'ACCESS_DENIED',
          message: 'You can only appeal your own claims' 
        },
        { status: 403 }
      );
    }
    
    // Step 6: Verify claim is in appealable state
    const appealableStatuses = ['held', 'rejected'];
    if (!appealableStatuses.includes(claim.status)) {
      return NextResponse.json(
        { 
          error: 'Bad Request', 
          code: 'NOT_APPEALABLE',
          message: `Claims with status "${claim.status}" cannot be appealed` 
        },
        { status: 400 }
      );
    }
    
    // Step 7: Check if already appealed
    if (claim.appealSubmitted) {
      return NextResponse.json(
        { 
          error: 'Bad Request', 
          code: 'ALREADY_APPEALED',
          message: 'This claim has already been appealed' 
        },
        { status: 400 }
      );
    }
    
    console.log('[Claim Appeal] Current status:', claim.status);
    
    const now = Timestamp.now();
    
    // Step 8: Update claim with appeal details
    await claimRef.update({
      status: 'under_appeal',
      appealSubmitted: true,
      appealText: reason,
      appealContext: additional_context,
      appealedAt: now,
      updated_at: now
    });
    
    console.log('[Claim Appeal] Appeal submitted');
    
    // Step 9: Log state transition
    await adminDb.collection('claimLogs').add({
      claimId,
      workerId: claim.workerId,
      action: 'appeal_submitted',
      status: 'under_appeal',
      details: `Appeal reason: ${reason}`,
      timestamp: now
    });
    
    // Step 10: Create appeal notification for admin
    await adminDb.collection('notifications').add({
      type: 'claim_appeal',
      claimId,
      workerId: claim.workerId,
      workerName: claim.workerName,
      appealReason: reason,
      appealContext: additional_context,
      status: 'unread',
      createdAt: now
    });
    
    console.log('[Claim Appeal] Admin notification created');
    
    // TODO: Send push notification to admin
    // TODO: Send email notification to admin
    
    return NextResponse.json({
      success: true,
      claim_id: claimId,
      status: 'under_appeal',
      message: 'Your appeal has been submitted successfully. An administrator will review it shortly.',
      appealed_at: now
    }, { status: 200 });
    
  } catch (error: any) {
    console.error('[Claim Appeal] Error:', {
      message: error.message,
      stack: error.stack
    });
    
    return NextResponse.json(
      { 
        error: 'Internal Server Error', 
        code: 'INTERNAL_ERROR',
        message: 'Failed to submit appeal' 
      },
      { status: 500 }
    );
  }
}
