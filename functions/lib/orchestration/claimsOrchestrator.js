"use strict";
/**
 * Claims Orchestrator - Main Entry Point
 * Executes the complete 7-step claim lifecycle
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.onClaimCreated = exports.onTriggerEventCreated = void 0;
const functions = __importStar(require("firebase-functions"));
const contextLoader_1 = require("./contextLoader");
const signalBuilder_1 = require("./signalBuilder");
const fraudDetection_1 = require("./fraudDetection");
const confidenceScoring_1 = require("./confidenceScoring");
const claimRouter_1 = require("./claimRouter");
const payoutCalculator_1 = require("./payoutCalculator");
const payoutInitiator_1 = require("./payoutInitiator");
const firestore_1 = require("../utils/firestore");
const logger_1 = require("../utils/logger");
/**
 * Firestore trigger: When a TriggerEvent is created, auto-create claims for eligible workers
 */
exports.onTriggerEventCreated = functions.firestore
    .document('triggerEvents/{eventId}')
    .onCreate(async (snapshot, context) => {
    const triggerEvent = snapshot.data();
    const eventId = context.params.eventId;
    logger_1.logger.info({
        service: 'claims-orchestrator',
        operation: 'trigger-event-created',
        triggerEventId: eventId,
        triggerType: triggerEvent.type,
        zone: triggerEvent.zone,
        message: 'Trigger event detected, creating claims for eligible workers'
    });
    try {
        // Query active policies in the trigger zone
        const activePolicies = await (0, firestore_1.queryCollection)('policies', [
            { field: 'zone', operator: '==', value: triggerEvent.zone },
            { field: 'status', operator: '==', value: 'active' }
        ]);
        logger_1.logger.info({
            service: 'claims-orchestrator',
            operation: 'trigger-event-created',
            triggerEventId: eventId,
            message: `Found ${activePolicies.length} eligible policies`
        });
        // Create a claim for each eligible worker
        const claimIds = [];
        for (const policy of activePolicies) {
            try {
                // Check if policy is within valid week
                const now = firestore_1.Timestamp.now();
                if (now.toMillis() < policy.weekStart.toMillis() || now.toMillis() > policy.weekEnd.toMillis()) {
                    continue;
                }
                // Create claim document
                const claimId = await (0, firestore_1.createDocument)('claims', {
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
                logger_1.logger.info({
                    service: 'claims-orchestrator',
                    operation: 'claim-created',
                    claimId,
                    workerId: policy.workerId,
                    triggerEventId: eventId,
                    message: 'Claim auto-created'
                });
            }
            catch (error) {
                logger_1.logger.error({
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
        await (0, firestore_1.updateDocument)('triggerEvents', eventId, {
            claimIds,
            affectedWorkersCount: claimIds.length
        });
    }
    catch (error) {
        logger_1.logger.error({
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
exports.onClaimCreated = functions.firestore
    .document('claims/{claimId}')
    .onCreate(async (snapshot, context) => {
    const claim = snapshot.data();
    const claimId = context.params.claimId;
    // Only process claims with pending_fraud_check status
    if (claim.status !== 'pending_fraud_check') {
        return;
    }
    logger_1.logger.info({
        service: 'claims-orchestrator',
        operation: 'claim-orchestration-start',
        claimId,
        workerId: claim.workerId,
        triggerType: claim.triggerType,
        message: 'Starting claim orchestration'
    });
    try {
        // STEP 1: Load Claim Context
        const claimContext = await (0, contextLoader_1.loadClaimContext)(claimId);
        if (!claimContext) {
            logger_1.logger.error({
                service: 'claims-orchestrator',
                operation: 'orchestration-failed',
                claimId,
                message: 'Failed to load claim context'
            });
            return;
        }
        // Update worker name (denormalized)
        await (0, firestore_1.updateDocument)('claims', claimId, {
            workerName: claimContext.worker.name
        });
        // STEP 2: Build Signal Vector
        const signalVector = await (0, signalBuilder_1.buildSignalVector)(claimContext);
        // STEP 3: Call Fraud Detection
        const fraudResult = await (0, fraudDetection_1.callFraudDetection)(claimId, signalVector);
        // Write fraud result to claim
        await (0, firestore_1.updateDocument)('claims', claimId, {
            fraudScore: fraudResult.anomaly_score,
            fraudRiskLevel: fraudResult.risk_level
        });
        // Create FraudSignal document if suspicious
        if (fraudResult.anomaly_score >= 0.3) {
            await createFraudSignal(claimId, claimContext.worker.uid, fraudResult);
        }
        // STEP 4: Call Confidence Scorer
        const confidenceResult = await (0, confidenceScoring_1.callConfidenceScorer)(claimId, signalVector, fraudResult);
        // Write confidence result to claim
        await (0, firestore_1.updateDocument)('claims', claimId, {
            confidenceScore: confidenceResult.confidence_score,
            decisionTrack: mapDecisionTrack(confidenceResult.decision_track),
            topContributingFeatures: confidenceResult.top_contributing_features
        });
        // STEP 5: Route the Claim
        const track = await (0, claimRouter_1.routeClaim)(claimId, confidenceResult, claimContext);
        // If Track A, continue to payout
        if (track === 'track_a') {
            // STEP 6: Compute Payout Amount
            const payoutAmount = await (0, payoutCalculator_1.computePayoutAmount)(claimContext);
            await (0, firestore_1.updateDocument)('claims', claimId, {
                payoutAmount
            });
            // STEP 7: Initiate Payout
            await (0, payoutInitiator_1.initiatePayout)(claimId, claimContext, payoutAmount);
        }
        logger_1.logger.info({
            service: 'claims-orchestrator',
            operation: 'orchestration-complete',
            claimId,
            workerId: claimContext.worker.uid,
            track,
            message: 'Claim orchestration completed successfully'
        });
    }
    catch (error) {
        logger_1.logger.error({
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
        await (0, firestore_1.updateDocument)('claims', claimId, {
            status: 'error',
            holdReason: `Orchestration failed: ${error.message}`
        });
    }
});
/**
 * Generate human-readable claim description
 */
function generateClaimDescription(triggerEvent) {
    const typeDescriptions = {
        heavy_rain: 'Severe rainfall',
        hazardous_aqi: 'Hazardous air quality',
        extreme_heat: 'Extreme heat conditions',
        zone_closure: 'Zone access restriction',
        platform_outage: 'Platform service disruption'
    };
    const severityDescriptions = {
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
async function createFraudSignal(claimId, workerId, fraudResult) {
    try {
        await (0, firestore_1.createDocument)('fraudSignals', {
            claimId,
            workerId,
            signalType: 'suspicious_pattern',
            severity: fraudResult.risk_level === 'high' ? 'high' : 'medium',
            anomalyScore: fraudResult.anomaly_score,
            details: fraudResult.top_contributing_features.map((f) => f.reason).join('; '),
            contributingFeatures: fraudResult.top_contributing_features,
            modelUsed: fraudResult.model_used,
            status: 'open',
            resolvedBy: null,
            resolvedAt: null,
            dismissalReason: null
        });
    }
    catch (error) {
        logger_1.logger.error({
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
function mapDecisionTrack(track) {
    if (track === 'auto_approve')
        return 'track_a';
    if (track === 'soft_review')
        return 'track_b';
    return 'track_c';
}
//# sourceMappingURL=claimsOrchestrator.js.map