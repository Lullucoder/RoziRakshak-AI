/**
 * Claims Orchestrator - Main Entry Point
 * Executes the complete 7-step claim lifecycle
 */

import * as functions from 'firebase-functions';
import { loadClaimContext } from './contextLoader';
import { buildSignalVector } from './signalBuilder';
import { callFraudDetection } from './fraudDetection';
import { callConfidenceScorer } from './confidenceScoring';
import { routeClaim } from './claimRouter';
import { computePayoutAmount } from './payoutCalculator';
import { initiatePayout } from './payoutInitiator';
import { createDocument, updateDocument, queryCollection, Timestamp } from '../utils/firestore';
import { logger } from '../utils/logger';
import { Claim, TriggerEvent, Policy } from '../types/claim';

/**
 * Firestore trigger: When a TriggerEvent is created, auto-create claims for eligible workers
 */
export const onTriggerEventCreated = functions.firestore
  .document('triggerEvents/{eventId}')
  .onCreate(async (snapshot, context) => {
    const triggerEvent = snapshot.data() as TriggerEvent;
    const eventId = context.params.eventId;
    
    logger.info({
      service: 'claims-orchestrator',
      operation: 'trigger-event-created',
      triggerEventId: eventId,
      triggerType: triggerEvent.type,
      zone: triggerEvent.zone,
      message: 'Trigger event detected, creating claims for eligible workers'
    });
    
    try {
      // Query active policies in the trigger zone
      const activePolicies = await queryCollection<Policy>(
        'policies',
        [
          { field: 'zone', operator: '==', value: triggerEvent.zone },
          { field: 'status', operator: '==', value: 'active' }
        ]
      );
      
      logger.info({
        service: 'claims-orchestrator',
        operation: 'trigger-event-created',
        triggerEventId: eventId,
        message: `Found ${activePolicies.length} eligible policies`
      });
      
      // Create a claim for each eligible worker
      const claimIds: string[] = [];
      
      for (const policy of activePolicies) {
        try {
          // Check if policy is within valid week
          const now = Timestamp.now();
          if (now.toMillis() < policy.weekStart.toMillis() || now.toMillis() > policy.weekEnd.toMillis()) {
            continue;
          }
          
          // Create claim document
          const claimId = await createDocument('claims', {
            workerId: policy.workerId,
            workerName: '', // Will be populated by orchestrator
            policyId: policy.id,
            triggerEventId: eventId,
            triggerType: triggerEvent.type,
            triggerSeverity: triggerEvent.severity,
            zone: triggerEvent.zone,
            city: triggerEvent.city,
            description: generateClaimDescription(triggerEvent),
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
            appealedAt: null
          });
          
          claimIds.push(claimId);
          
          logger.info({
            service: 'claims-orchestrator',
            operation: 'claim-created',
            claimId,
            workerId: policy.workerId,
            triggerEventId: eventId,
            message: 'Claim auto-created'
          });
          
        } catch (error: any) {
          logger.error({
            service: 'claims-orchestrator',
            operation: 'claim-creation-failed',
            policyId: policy.id,
            workerId: policy.workerId,
            message: 'Failed to create claim',
            error: {
              message: error.message,
              stack: error.stack,
              code: error.code || 'UNKNOWN'
            }
          });
        }
      }
      
      // Update trigger event with created claim IDs
      await updateDocument('triggerEvents', eventId, {
        claimIds,
        affectedWorkersCount: claimIds.length
      });
      
    } catch (error: any) {
      logger.error({
        service: 'claims-orchestrator',
        operation: 'trigger-event-processing-failed',
        triggerEventId: eventId,
        message: 'Failed to process trigger event',
        error: {
          message: error.message,
          stack: error.stack,
          code: error.code || 'UNKNOWN'
        }
      });
    }
  });

/**
 * Firestore trigger: When a Claim with status "pending_fraud_check" is created, execute orchestration
 */
export const onClaimCreated = functions.firestore
  .document('claims/{claimId}')
  .onCreate(async (snapshot, context) => {
    const claim = snapshot.data() as Claim;
    const claimId = context.params.claimId;
    
    // Only process claims with pending_fraud_check status
    if (claim.status !== 'pending_fraud_check') {
      return;
    }
    
    logger.info({
      service: 'claims-orchestrator',
      operation: 'claim-orchestration-start',
      claimId,
      workerId: claim.workerId,
      triggerType: claim.triggerType,
      message: 'Starting claim orchestration'
    });
    
    try {
      // STEP 1: Load Claim Context
      const claimContext = await loadClaimContext(claimId);
      if (!claimContext) {
        logger.error({
          service: 'claims-orchestrator',
          operation: 'orchestration-failed',
          claimId,
          message: 'Failed to load claim context'
        });
        return;
      }
      
      // Update worker name (denormalized)
      await updateDocument('claims', claimId, {
        workerName: claimContext.worker.name
      });
      
      // STEP 2: Build Signal Vector
      const signalVector = await buildSignalVector(claimContext);
      
      // STEP 3: Call Fraud Detection
      const fraudResult = await callFraudDetection(claimId, signalVector);
      
      // Write fraud result to claim
      await updateDocument('claims', claimId, {
        fraudScore: fraudResult.anomaly_score,
        fraudRiskLevel: fraudResult.risk_level
      });
      
      // Create FraudSignal document if suspicious
      if (fraudResult.anomaly_score >= 0.3) {
        await createFraudSignal(claimId, claimContext.worker.uid, fraudResult);
      }
      
      // STEP 4: Call Confidence Scorer
      const confidenceResult = await callConfidenceScorer(claimId, signalVector, fraudResult);
      
      // Write confidence result to claim
      await updateDocument('claims', claimId, {
        confidenceScore: confidenceResult.confidence_score,
        decisionTrack: mapDecisionTrack(confidenceResult.decision_track),
        topContributingFeatures: confidenceResult.top_contributing_features
      });
      
      // STEP 5: Route the Claim
      const track = await routeClaim(claimId, confidenceResult, claimContext);
      
      // If Track A, continue to payout
      if (track === 'track_a') {
        // STEP 6: Compute Payout Amount
        const payoutAmount = await computePayoutAmount(claimContext);
        
        await updateDocument('claims', claimId, {
          payoutAmount
        });
        
        // STEP 7: Initiate Payout
        await initiatePayout(claimId, claimContext, payoutAmount);
      }
      
      logger.info({
        service: 'claims-orchestrator',
        operation: 'orchestration-complete',
        claimId,
        workerId: claimContext.worker.uid,
        track,
        message: 'Claim orchestration completed successfully'
      });
      
    } catch (error: any) {
      logger.error({
        service: 'claims-orchestrator',
        operation: 'orchestration-failed',
        claimId,
        message: 'Claim orchestration failed',
        error: {
          message: error.message,
          stack: error.stack,
          code: error.code || 'UNKNOWN'
        }
      });
      
      // Update claim status to error
      await updateDocument('claims', claimId, {
        status: 'error',
        holdReason: `Orchestration failed: ${error.message}`
      });
    }
  });

/**
 * Generate human-readable claim description
 */
function generateClaimDescription(triggerEvent: TriggerEvent): string {
  const typeDescriptions: Record<string, string> = {
    heavy_rain: 'Severe rainfall',
    hazardous_aqi: 'Hazardous air quality',
    extreme_heat: 'Extreme heat conditions',
    zone_closure: 'Zone access restriction',
    platform_outage: 'Platform service disruption'
  };
  
  const severityDescriptions: Record<string, string> = {
    moderate: 'Moderate',
    high: 'High',
    severe: 'Severe'
  };
  
  const typeDesc = typeDescriptions[triggerEvent.type] || triggerEvent.type;
  const severityDesc = severityDescriptions[triggerEvent.severity] || triggerEvent.severity;
  
  return `${severityDesc} ${typeDesc.toLowerCase()} in ${triggerEvent.zone} zone. Work window affected.`;
}

/**
 * Create FraudSignal document
 */
async function createFraudSignal(claimId: string, workerId: string, fraudResult: any): Promise<void> {
  try {
    await createDocument('fraudSignals', {
      claimId,
      workerId,
      signalType: 'suspicious_pattern',
      severity: fraudResult.risk_level === 'high' ? 'high' : 'medium',
      anomalyScore: fraudResult.anomaly_score,
      details: fraudResult.top_contributing_features.map((f: any) => f.reason).join('; '),
      contributingFeatures: fraudResult.top_contributing_features,
      modelUsed: fraudResult.model_used,
      status: 'open',
      resolvedBy: null,
      resolvedAt: null,
      dismissalReason: null
    });
  } catch (error: any) {
    logger.error({
      service: 'claims-orchestrator',
      operation: 'create-fraud-signal',
      claimId,
      message: 'Failed to create fraud signal',
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code || 'UNKNOWN'
      }
    });
  }
}

/**
 * Map decision track string to enum
 */
function mapDecisionTrack(track: string): 'track_a' | 'track_b' | 'track_c' {
  if (track === 'auto_approve') return 'track_a';
  if (track === 'soft_review') return 'track_b';
  return 'track_c';
}
