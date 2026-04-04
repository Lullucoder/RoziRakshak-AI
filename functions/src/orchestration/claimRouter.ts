/**
 * Claim Router - Step 5 of Claims Orchestration
 * Routes claims to Track A/B/C based on confidence score
 */

import { updateDocument } from '../utils/firestore';
import { logger } from '../utils/logger';
import { ClaimContext } from '../types/claim';
import * as admin from 'firebase-admin';

interface ConfidenceResult {
  confidence_score: number;
  decision_track: string;
  top_contributing_features: Array<{
    feature: string;
    coefficient: number;
    reason: string;
  }>;
  fallback_checks?: {
    trigger_confirmed: boolean;
    zone_overlap: boolean;
    no_emulator: boolean;
    speed_plausible: boolean;
    no_duplicate: boolean;
  };
}

/**
 * Route claim based on confidence score
 * Track A (≥0.75): auto_approved
 * Track B (0.40-0.74): soft_review
 * Track C (<0.40): held
 */
export async function routeClaim(
  claimId: string,
  confidenceResult: ConfidenceResult,
  claimContext: ClaimContext
): Promise<'track_a' | 'track_b' | 'track_c'> {
  const { confidence_score } = confidenceResult;
  
  logger.info({
    service: 'claims-orchestrator',
    operation: 'route-claim',
    claimId,
    workerId: claimContext.worker.uid,
    confidenceScore: confidence_score,
    message: 'Routing claim based on confidence score'
  });
  
  // Track A: Auto-approve (confidence ≥ 0.75)
  if (confidence_score >= 0.75) {
    await updateDocument('claims', claimId, {
      status: 'auto_approved',
      decisionTrack: 'track_a'
    });
    
    logger.info({
      service: 'claims-orchestrator',
      operation: 'route-claim',
      claimId,
      track: 'track_a',
      message: 'Claim auto-approved (Track A)'
    });
    
    return 'track_a';
  }
  
  // Track B: Soft review (0.40 ≤ confidence < 0.75)
  if (confidence_score >= 0.40) {
    await updateDocument('claims', claimId, {
      status: 'under_review',
      decisionTrack: 'track_b'
    });
    
    logger.info({
      service: 'claims-orchestrator',
      operation: 'route-claim',
      claimId,
      track: 'track_b',
      message: 'Claim sent to soft review (Track B)'
    });
    
    // Schedule re-evaluation after 2 hours
    await scheduleClaimReEvaluation(claimId, claimContext);
    
    return 'track_b';
  }
  
  // Track C: Hold (confidence < 0.40)
  const holdReason = generatePlainLanguageReason(confidenceResult);
  
  await updateDocument('claims', claimId, {
    status: 'held',
    decisionTrack: 'track_c',
    holdReason
  });
  
  logger.info({
    service: 'claims-orchestrator',
    operation: 'route-claim',
    claimId,
    track: 'track_c',
    holdReason,
    message: 'Claim held (Track C)'
  });
  
  // TODO: Send notification to worker with hold reason (Task 16)
  
  return 'track_c';
}

/**
 * Generate plain-language explanation for why claim was held
 */
function generatePlainLanguageReason(confidenceResult: ConfidenceResult): string {
  const { fallback_checks, top_contributing_features } = confidenceResult;
  
  // If we have fallback checks, use them for plain language
  if (fallback_checks) {
    const reasons: string[] = [];
    
    if (!fallback_checks.trigger_confirmed) {
      reasons.push('The trigger event could not be verified from external sources');
    }
    
    if (!fallback_checks.zone_overlap) {
      reasons.push('Your location does not match the affected zone');
    }
    
    if (!fallback_checks.no_emulator) {
      reasons.push('Device verification failed');
    }
    
    if (!fallback_checks.speed_plausible) {
      reasons.push('Movement pattern appears unusual');
    }
    
    if (!fallback_checks.no_duplicate) {
      reasons.push('A similar claim was already submitted');
    }
    
    if (reasons.length > 0) {
      return `Your claim requires manual review: ${reasons.join('; ')}.`;
    }
  }
  
  // Otherwise use top contributing features
  if (top_contributing_features && top_contributing_features.length > 0) {
    const topReasons = top_contributing_features
      .slice(0, 3)
      .map(f => f.reason)
      .join('; ');
    
    return `Your claim requires manual review: ${topReasons}.`;
  }
  
  // Default message
  return 'Your claim requires manual review by our team. We will notify you once the review is complete.';
}

/**
 * Schedule claim re-evaluation after 2 hours for Track B claims
 * Uses Firestore document with TTL for scheduling
 */
export async function scheduleClaimReEvaluation(
  claimId: string,
  claimContext: ClaimContext
): Promise<void> {
  const db = admin.firestore();
  
  try {
    const reEvaluationTime = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now
    
    // Create a scheduled re-evaluation document
    await db.collection('claimReEvaluations').add({
      claimId,
      workerId: claimContext.worker.uid,
      scheduledAt: reEvaluationTime,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    logger.info({
      service: 'claims-orchestrator',
      operation: 'schedule-re-evaluation',
      claimId,
      scheduledAt: reEvaluationTime.toISOString(),
      message: 'Claim re-evaluation scheduled for 2 hours'
    });
  } catch (error: any) {
    logger.error({
      service: 'claims-orchestrator',
      operation: 'schedule-re-evaluation-error',
      claimId,
      message: error.message
    });
    // Don't throw - scheduling failure shouldn't block claim processing
  }
}

/**
 * Re-evaluate a Track B claim after 2 hours
 * This function should be called by a scheduled Cloud Function
 */
export async function reEvaluateClaim(claimId: string): Promise<void> {
  const db = admin.firestore();
  
  try {
    logger.info({
      service: 'claims-orchestrator',
      operation: 're-evaluate-claim',
      claimId,
      message: 'Starting claim re-evaluation'
    });
    
    // Fetch updated claim data
    const claimDoc = await db.collection('claims').doc(claimId).get();
    
    if (!claimDoc.exists) {
      logger.warn({
        service: 'claims-orchestrator',
        operation: 're-evaluate-claim',
        claimId,
        message: 'Claim not found for re-evaluation'
      });
      return;
    }
    
    const claim = claimDoc.data();
    
    // Only re-evaluate if still in under_review status
    if (claim?.status !== 'under_review') {
      logger.info({
        service: 'claims-orchestrator',
        operation: 're-evaluate-claim',
        claimId,
        currentStatus: claim?.status,
        message: 'Claim status changed, skipping re-evaluation'
      });
      return;
    }
    
    // Re-run confidence scoring with updated data
    // This would involve calling the confidence scorer again
    // For now, we'll implement a simple check: if no fraud signals were created, auto-promote
    
    const fraudSignalsSnapshot = await db.collection('fraudSignals')
      .where('claimId', '==', claimId)
      .where('status', '==', 'open')
      .get();
    
    const hasFraudSignals = !fraudSignalsSnapshot.empty;
    
    if (!hasFraudSignals) {
      // No fraud signals - auto-promote to Track A
      await updateDocument('claims', claimId, {
        status: 'auto_approved',
        decisionTrack: 'track_a',
        reEvaluatedAt: admin.firestore.FieldValue.serverTimestamp(),
        reEvaluationReason: 'No fraud signals detected after 2-hour review window'
      });
      
      logger.info({
        service: 'claims-orchestrator',
        operation: 're-evaluate-claim',
        claimId,
        message: 'Claim auto-promoted to Track A after re-evaluation'
      });
    } else {
      logger.info({
        service: 'claims-orchestrator',
        operation: 're-evaluate-claim',
        claimId,
        message: 'Claim remains in Track B - fraud signals still open'
      });
    }
  } catch (error: any) {
    logger.error({
      service: 'claims-orchestrator',
      operation: 're-evaluate-claim-error',
      claimId,
      message: error.message
    });
  }
}
