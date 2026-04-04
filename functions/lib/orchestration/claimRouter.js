"use strict";
/**
 * Claim Router - Step 5 of Claims Orchestration
 * Routes claims to Track A/B/C based on confidence score
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
exports.routeClaim = routeClaim;
exports.scheduleClaimReEvaluation = scheduleClaimReEvaluation;
exports.reEvaluateClaim = reEvaluateClaim;
const firestore_1 = require("../utils/firestore");
const logger_1 = require("../utils/logger");
const admin = __importStar(require("firebase-admin"));
/**
 * Route claim based on confidence score
 * Track A (≥0.75): auto_approved
 * Track B (0.40-0.74): soft_review
 * Track C (<0.40): held
 */
async function routeClaim(claimId, confidenceResult, claimContext) {
    const { confidence_score } = confidenceResult;
    logger_1.logger.info({
        service: 'claims-orchestrator',
        operation: 'route-claim',
        claimId,
        workerId: claimContext.worker.uid,
        confidenceScore: confidence_score,
        message: 'Routing claim based on confidence score'
    });
    // Track A: Auto-approve (confidence ≥ 0.75)
    if (confidence_score >= 0.75) {
        await (0, firestore_1.updateDocument)('claims', claimId, {
            status: 'auto_approved',
            decisionTrack: 'track_a'
        });
        logger_1.logger.info({
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
        await (0, firestore_1.updateDocument)('claims', claimId, {
            status: 'under_review',
            decisionTrack: 'track_b'
        });
        logger_1.logger.info({
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
    await (0, firestore_1.updateDocument)('claims', claimId, {
        status: 'held',
        decisionTrack: 'track_c',
        holdReason
    });
    logger_1.logger.info({
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
function generatePlainLanguageReason(confidenceResult) {
    const { fallback_checks, top_contributing_features } = confidenceResult;
    // If we have fallback checks, use them for plain language
    if (fallback_checks) {
        const reasons = [];
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
async function scheduleClaimReEvaluation(claimId, claimContext) {
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
        logger_1.logger.info({
            service: 'claims-orchestrator',
            operation: 'schedule-re-evaluation',
            claimId,
            scheduledAt: reEvaluationTime.toISOString(),
            message: 'Claim re-evaluation scheduled for 2 hours'
        });
    }
    catch (error) {
        logger_1.logger.error({
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
async function reEvaluateClaim(claimId) {
    const db = admin.firestore();
    try {
        logger_1.logger.info({
            service: 'claims-orchestrator',
            operation: 're-evaluate-claim',
            claimId,
            message: 'Starting claim re-evaluation'
        });
        // Fetch updated claim data
        const claimDoc = await db.collection('claims').doc(claimId).get();
        if (!claimDoc.exists) {
            logger_1.logger.warn({
                service: 'claims-orchestrator',
                operation: 're-evaluate-claim',
                claimId,
                message: 'Claim not found for re-evaluation'
            });
            return;
        }
        const claim = claimDoc.data();
        // Only re-evaluate if still in under_review status
        if ((claim === null || claim === void 0 ? void 0 : claim.status) !== 'under_review') {
            logger_1.logger.info({
                service: 'claims-orchestrator',
                operation: 're-evaluate-claim',
                claimId,
                currentStatus: claim === null || claim === void 0 ? void 0 : claim.status,
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
            await (0, firestore_1.updateDocument)('claims', claimId, {
                status: 'auto_approved',
                decisionTrack: 'track_a',
                reEvaluatedAt: admin.firestore.FieldValue.serverTimestamp(),
                reEvaluationReason: 'No fraud signals detected after 2-hour review window'
            });
            logger_1.logger.info({
                service: 'claims-orchestrator',
                operation: 're-evaluate-claim',
                claimId,
                message: 'Claim auto-promoted to Track A after re-evaluation'
            });
        }
        else {
            logger_1.logger.info({
                service: 'claims-orchestrator',
                operation: 're-evaluate-claim',
                claimId,
                message: 'Claim remains in Track B - fraud signals still open'
            });
        }
    }
    catch (error) {
        logger_1.logger.error({
            service: 'claims-orchestrator',
            operation: 're-evaluate-claim-error',
            claimId,
            message: error.message
        });
    }
}
//# sourceMappingURL=claimRouter.js.map