"use strict";
/**
 * STEP 4: Call Confidence Scorer
 * Calls ML service or uses fallback rules
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.callConfidenceScorer = callConfidenceScorer;
const node_fetch_1 = __importDefault(require("node-fetch"));
const logger_1 = require("../utils/logger");
const ML_SERVICE_URL = process.env.RENDER_ML_URL || 'https://ml-microservice-api.onrender.com';
const CONFIDENCE_TIMEOUT_MS = 5000;
/**
 * Call confidence scoring ML service with fallback logic
 */
async function callConfidenceScorer(claimId, signalVector, fraudResult) {
    logger_1.logger.info({
        service: 'claims-orchestrator',
        operation: 'confidence-scoring',
        claimId,
        message: 'Calling confidence scoring service'
    });
    // Build confidence features
    const confidenceFeatures = {
        trigger_confirmed: true, // From triggerEvent existence
        zone_overlap_score: signalVector.historical_zone_match ? 1.0 : 0.0,
        emulator_flag: signalVector.emulator_flag,
        speed_plausible: signalVector.speed_between_pings_kmh <= 80,
        duplicate_check_passed: true, // TODO: Implement duplicate detection
        fraud_anomaly_score: fraudResult.anomaly_score,
        historical_trust_score: 0.8, // Default, should come from worker profile
        claim_frequency_7d: signalVector.claim_frequency_7d,
        device_consistency_score: 0.8 // Default
    };
    try {
        // Call ML service with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIDENCE_TIMEOUT_MS);
        const response = await (0, node_fetch_1.default)(`${ML_SERVICE_URL}/confidence/score`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                request_id: claimId,
                claim_id: claimId,
                features: confidenceFeatures
            }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            throw new Error(`ML service returned ${response.status}`);
        }
        const result = await response.json();
        logger_1.logger.info({
            service: 'claims-orchestrator',
            operation: 'confidence-scoring',
            claimId,
            message: 'Confidence scoring completed',
            metadata: {
                confidence_score: result.confidence_score,
                decision_track: result.decision_track,
                model_used: result.model_used
            }
        });
        return result;
    }
    catch (error) {
        logger_1.logger.warn({
            service: 'claims-orchestrator',
            operation: 'confidence-scoring',
            claimId,
            message: `ML confidence service unavailable, using fallback rules: ${error.message}`
        });
        // Use fallback rule engine
        return useConfidenceFallbackRules(claimId, confidenceFeatures);
    }
}
/**
 * Fallback confidence scoring using weighted binary checks
 */
function useConfidenceFallbackRules(claimId, features) {
    // 5 binary checks × 0.2 each
    const checks = {
        trigger_confirmed: features.trigger_confirmed,
        zone_overlap: features.zone_overlap_score > 0.5,
        no_emulator: !features.emulator_flag,
        speed_plausible: features.speed_plausible,
        no_duplicate: features.duplicate_check_passed
    };
    const confidence_score = Object.values(checks).filter(Boolean).length * 0.2;
    let decision_track;
    if (confidence_score >= 0.75)
        decision_track = 'auto_approve';
    else if (confidence_score >= 0.40)
        decision_track = 'soft_review';
    else
        decision_track = 'hold';
    logger_1.logger.info({
        service: 'claims-orchestrator',
        operation: 'confidence-scoring-fallback',
        claimId,
        message: 'Fallback confidence rules applied',
        metadata: {
            confidence_score,
            decision_track,
            checks
        }
    });
    return {
        request_id: claimId,
        status: 'success',
        claim_id: claimId,
        confidence_score,
        decision_track,
        top_contributing_features: [],
        model_used: 'fallback_rules',
        fallback_checks: checks,
        timestamp: new Date().toISOString()
    };
}
//# sourceMappingURL=confidenceScoring.js.map