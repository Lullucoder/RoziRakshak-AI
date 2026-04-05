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
function mapSignalVectorToConfidencePayload(signalVector, fraudResult) {
    return {
        motion_variance: signalVector.motion_variance,
        network_type: signalVector.network_type === 'wifi' ? 0 : 1,
        gps_accuracy_radius: signalVector.gps_accuracy_m,
        rtt_ms: signalVector.rtt_ms,
        distance_from_home_cluster_km: signalVector.distance_from_home_km,
        route_continuity_score: signalVector.route_continuity_score,
        speed_between_pings_kmh: signalVector.speed_between_pings_kmh,
        claim_frequency_7d: signalVector.claim_frequency_7d,
        days_since_registration: signalVector.days_since_registration,
        upi_changed_recently: signalVector.payout_account_change_days <= 7 ? 1 : 0,
        simultaneous_claim_density_ratio: signalVector.simultaneous_claim_density_ratio,
        shared_device_flag: signalVector.shared_device_count > 1 ? 1 : 0,
        claim_timestamp_cluster_flag: signalVector.claim_timestamp_cluster_size >= 3 ? 1 : 0,
        trigger_confirmed: 1,
        zone_overlap: signalVector.historical_zone_match ? 1.0 : signalVector.zone_entry_plausibility,
        emulator_flag: signalVector.emulator_flag ? 1 : 0,
        anomaly_score: fraudResult.anomaly_score,
        is_suspicious: fraudResult.is_suspicious,
    };
}
function getFallbackChecks(payload) {
    return {
        trigger_confirmed: payload.trigger_confirmed === 1,
        zone_overlap: payload.zone_overlap > 0.5,
        no_emulator: payload.emulator_flag === 0,
        speed_plausible: payload.speed_between_pings_kmh < 80,
        no_duplicate: payload.shared_device_flag === 0,
    };
}
function mapMlConfidenceResponse(claimId, result) {
    var _a;
    const topFactors = (_a = result.top_contributing_factors) !== null && _a !== void 0 ? _a : [];
    const mappedFeatures = topFactors.slice(0, 3).map((factor) => {
        const sign = factor.direction === 'negative' ? -1 : 1;
        return {
            feature: factor.factor,
            coefficient: sign * Math.abs(factor.weight),
            reason: `${factor.factor} (${factor.direction})`,
        };
    });
    const decision_track = result.decision === 'auto_approve' || result.decision === 'soft_review' || result.decision === 'hold'
        ? result.decision
        : 'soft_review';
    return {
        request_id: claimId,
        status: 'success',
        claim_id: claimId,
        confidence_score: Number.isFinite(result.confidence_score) ? result.confidence_score : 0.5,
        decision_track,
        top_contributing_features: mappedFeatures,
        model_used: result.model_used === 'logistic_regression' ? 'logistic_regression' : 'fallback_rules',
        timestamp: new Date().toISOString(),
    };
}
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
    const confidencePayload = mapSignalVectorToConfidencePayload(signalVector, fraudResult);
    const fallbackChecks = getFallbackChecks(confidencePayload);
    try {
        // Call ML service with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIDENCE_TIMEOUT_MS);
        const response = await (0, node_fetch_1.default)(`${ML_SERVICE_URL}/confidence/score`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(confidencePayload),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            throw new Error(`ML service returned ${response.status}`);
        }
        const result = mapMlConfidenceResponse(claimId, await response.json());
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
        return useConfidenceFallbackRules(claimId, fallbackChecks);
    }
}
/**
 * Fallback confidence scoring using weighted binary checks
 */
function useConfidenceFallbackRules(claimId, checks) {
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