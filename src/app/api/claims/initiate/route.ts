/**
 * Manual Claim Initiation API Route
 * POST /api/claims/initiate
 * 
 * Allows workers to manually initiate claims (not auto-triggered)
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

// Rate limiting using in-memory store (replace with Upstash Redis in production)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * POST /api/claims/initiate
 * 
 * Request body:
 * {
 *   trigger_type: string;
 *   trigger_severity: 'moderate' | 'high' | 'severe';
 *   zone: string;
 *   description: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
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
      console.error('[Claim Initiate] Token verification failed:', error.message);
      return NextResponse.json(
        { 
          error: 'Unauthorized', 
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired token' 
        },
        { status: 401 }
      );
    }
    
    const workerId = decodedToken.uid;
    
    console.log('[Claim Initiate] Request from worker:', workerId);
    
    // Step 2: Rate limiting
    const rateLimitKey = `claim_initiate:${workerId}`;
    const now = Date.now();
    const rateLimitData = rateLimitStore.get(rateLimitKey);
    
    if (rateLimitData) {
      if (now < rateLimitData.resetAt) {
        if (rateLimitData.count >= RATE_LIMIT_MAX) {
          return NextResponse.json(
            { 
              error: 'Rate limit exceeded', 
              code: 'RATE_LIMIT_EXCEEDED',
              message: `Maximum ${RATE_LIMIT_MAX} manual claim attempts per 24 hours`,
              retry_after: Math.ceil((rateLimitData.resetAt - now) / 1000)
            },
            { status: 429 }
          );
        }
        rateLimitData.count++;
      } else {
        // Reset window
        rateLimitStore.set(rateLimitKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
      }
    } else {
      rateLimitStore.set(rateLimitKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    }
    
    // Step 3: Parse request body
    const body = await request.json();
    const { trigger_type, trigger_severity, zone, description } = body;
    
    console.log('[Claim Initiate] Request data:', {
      trigger_type,
      trigger_severity,
      zone
    });
    
    // Step 4: Validate inputs
    if (!trigger_type || !trigger_severity || !zone || !description) {
      return NextResponse.json(
        { 
          error: 'Bad Request', 
          code: 'MISSING_FIELDS',
          message: 'Missing required fields: trigger_type, trigger_severity, zone, description' 
        },
        { status: 400 }
      );
    }
    
    const validSeverities = ['moderate', 'high', 'severe'];
    if (!validSeverities.includes(trigger_severity)) {
      return NextResponse.json(
        { 
          error: 'Bad Request', 
          code: 'INVALID_SEVERITY',
          message: 'Severity must be one of: moderate, high, severe' 
        },
        { status: 400 }
      );
    }
    
    // Step 5: Get worker document
    const workerDoc = await adminDb.collection('workers').doc(workerId).get();
    
    if (!workerDoc.exists) {
      return NextResponse.json(
        { 
          error: 'Not Found', 
          code: 'WORKER_NOT_FOUND',
          message: 'Worker profile not found' 
        },
        { status: 404 }
      );
    }
    
    const worker = workerDoc.data()!;
    
    // Step 6: Check for active policy
    const now_timestamp = Timestamp.now();
    const activePoliciesSnapshot = await adminDb
      .collection('policies')
      .where('workerId', '==', workerId)
      .where('status', '==', 'active')
      .where('weekStart', '<=', now_timestamp)
      .where('weekEnd', '>=', now_timestamp)
      .limit(1)
      .get();
    
    if (activePoliciesSnapshot.empty) {
      return NextResponse.json(
        { 
          error: 'No Active Policy', 
          code: 'NO_ACTIVE_POLICY',
          message: 'You do not have an active policy for the current week' 
        },
        { status: 400 }
      );
    }
    
    const policy = activePoliciesSnapshot.docs[0].data();
    const policyId = activePoliciesSnapshot.docs[0].id;
    
    console.log('[Claim Initiate] Active policy found:', policyId);
    
    // Step 7: Check max claims per week
    const weekStart = policy.weekStart;
    const weekEnd = policy.weekEnd;
    
    const existingClaimsSnapshot = await adminDb
      .collection('claims')
      .where('workerId', '==', workerId)
      .where('policyId', '==', policyId)
      .where('createdAt', '>=', weekStart)
      .where('createdAt', '<=', weekEnd)
      .get();
    
    const maxClaimsPerWeek = policy.maxClaimsPerWeek || 5;
    
    if (existingClaimsSnapshot.size >= maxClaimsPerWeek) {
      return NextResponse.json(
        { 
          error: 'Max Claims Exceeded', 
          code: 'MAX_CLAIMS_EXCEEDED',
          message: `You have reached the maximum of ${maxClaimsPerWeek} claims for this week` 
        },
        { status: 400 }
      );
    }
    
    console.log('[Claim Initiate] Claims this week:', existingClaimsSnapshot.size, '/', maxClaimsPerWeek);
    
    // Step 8: Create claim document
    const claimRef = adminDb.collection('claims').doc();
    const claimData = {
      workerId,
      workerName: worker.name || 'Unknown',
      policyId,
      triggerEventId: null, // Manual claim, no trigger event
      triggerType: trigger_type,
      triggerSeverity: trigger_severity,
      zone,
      city: worker.city || 'Unknown',
      description,
      status: 'pending_fraud_check',
      confidenceScore: null,
      payoutAmount: 0,
      payoutId: null,
      resolvedAt: null,
      fraudScore: null,
      fraudRiskLevel: null,
      fraudSignalIds: [],
      decisionTrack: null,
      topContributingFeatures: [],
      holdReason: null,
      appealSubmitted: false,
      appealText: null,
      appealedAt: null,
      manuallyInitiated: true, // Flag for manual claims
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };
    
    await claimRef.set(claimData);
    
    console.log('[Claim Initiate] Claim created:', claimRef.id);
    
    // Step 9: Log state transition
    await adminDb.collection('claimLogs').add({
      claimId: claimRef.id,
      workerId,
      action: 'claim_initiated',
      status: 'pending_fraud_check',
      details: 'Manual claim initiated by worker',
      timestamp: Timestamp.now()
    });
    
    // Step 10: Return success response
    return NextResponse.json({
      success: true,
      claim_id: claimRef.id,
      status: 'pending_fraud_check',
      message: 'Claim initiated successfully. It will be processed automatically.',
      policy_id: policyId,
      claims_remaining: maxClaimsPerWeek - existingClaimsSnapshot.size - 1
    }, { status: 201 });
    
  } catch (error: any) {
    console.error('[Claim Initiate] Error:', {
      message: error.message,
      stack: error.stack
    });
    
    return NextResponse.json(
      { 
        error: 'Internal Server Error', 
        code: 'INTERNAL_ERROR',
        message: 'Failed to initiate claim. Please try again.' 
      },
      { status: 500 }
    );
  }
}
