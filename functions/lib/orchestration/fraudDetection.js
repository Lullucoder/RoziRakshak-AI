"use strict";
/**
 * STEP 3: Call Fraud Detection
 * Calls ML service or uses fallback rules
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.callFraudDetection = callFraudDetection;
exports.checkDuplicateClaim = checkDuplicateClaim;
exports.checkFraudRing = checkFraudRing;
const node_fetch_1 = __importDefault(require("node-fetch"));
const admin = __importStar(require("firebase-admin"));
const logger_1 = require("../utils/logger");
const firestore_1 = require("../utils/firestore");
const ML_SERVICE_URL = process.env.RENDER_ML_URL || 'https://ml-microservice-api.onrender.com';
const FRAUD_TIMEOUT_MS = 5000;
/**
 * Call fraud detection ML service with fallback logic
 */
async function callFraudDetection(claimId, signalVector) {
    logger_1.logger.info({
        service: 'claims-orchestrator',
        operation: 'fraud-detection',
        claimId,
        message: 'Calling fraud detection service'
    });
    try {
        // Call ML service with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FRAUD_TIMEOUT_MS);
        const response = await (0, node_fetch_1.default)(`${ML_SERVICE_URL}/fraud/score`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                request_id: claimId,
                claim_id: claimId,
                features: signalVector
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
            operation: 'fraud-detection',
            claimId,
            message: 'Fraud detection completed',
            metadata: {
                anomaly_score: result.anomaly_score,
                risk_level: result.risk_level,
                model_used: result.model_used
            }
        });
        // Create FraudSignal document if suspicious
        await createFraudSignalIfNeeded(claimId, result, signalVector);
        return result;
    }
    catch (error) {
        logger_1.logger.warn({
            service: 'claims-orchestrator',
            operation: 'fraud-detection',
            claimId,
            message: `ML fraud service unavailable, using fallback rules: ${error.message}`
        });
        // Use fallback rule engine
        const fallbackResult = useFraudFallbackRules(claimId, signalVector);
        // Create FraudSignal document if suspicious
        await createFraudSignalIfNeeded(claimId, fallbackResult, signalVector);
        return fallbackResult;
    }
}
/**
 * Fallback fraud detection using hardcoded rules
 */
function useFraudFallbackRules(claimId, signalVector) {
    const fallbackRules = [];
    let anomaly_score = 0.1; // Default low risk
    // Rule 1: Emulator detected
    if (signalVector.emulator_flag) {
        fallbackRules.push('Emulator detected');
        anomaly_score = 1.0;
    }
    // Rule 2: Excessive claim frequency
    else if (signalVector.claim_frequency_7d > 3) {
        fallbackRules.push('Excessive claim frequency (>3 in 7 days)');
        anomaly_score = 1.0;
    }
    // Rule 3: Impossible speed
    else if (signalVector.speed_between_pings_kmh > 80) {
        fallbackRules.push('Impossible speed detected (>80 km/h)');
        anomaly_score = 1.0;
    }
    const risk_level = anomaly_score >= 0.7 ? 'high' :
        anomaly_score >= 0.3 ? 'medium' : 'low';
    logger_1.logger.info({
        service: 'claims-orchestrator',
        operation: 'fraud-detection-fallback',
        claimId,
        message: 'Fallback fraud rules applied',
        metadata: {
            anomaly_score,
            risk_level,
            rules_triggered: fallbackRules
        }
    });
    return {
        request_id: claimId,
        status: 'success',
        claim_id: claimId,
        anomaly_score,
        risk_level,
        is_suspicious: anomaly_score >= 0.7,
        top_contributing_features: fallbackRules.map(rule => ({
            feature: rule,
            contribution: 1.0,
            reason: rule
        })),
        model_used: 'fallback_rules',
        fallback_rules_triggered: fallbackRules,
        timestamp: new Date().toISOString()
    };
}
/**
 * Create FraudSignal document if anomaly score warrants it
 */
async function createFraudSignalIfNeeded(claimId, fraudResult, signalVector) {
    const { anomaly_score, top_contributing_features } = fraudResult;
    // Only create fraud signals for medium or higher risk
    if (anomaly_score < 0.3) {
        return;
    }
    // Determine severity based on anomaly score
    let severity;
    if (anomaly_score >= 0.9) {
        severity = 'critical';
    }
    else if (anomaly_score >= 0.7) {
        severity = 'high';
    }
    else if (anomaly_score >= 0.3) {
        severity = 'medium';
    }
    else {
        severity = 'low';
    }
    // Generate plain-language explanation
    const explanation = generateFraudExplanation(fraudResult, signalVector);
    // Determine signal type based on contributing features
    const signalType = determineSignalType(top_contributing_features);
    try {
        const fraudSignalData = {
            claimId,
            workerId: '', // Will be populated by orchestrator
            signalType,
            severity,
            anomalyScore: anomaly_score,
            contributingFeatures: top_contributing_features.map(f => ({
                feature: f.feature,
                contribution: f.contribution,
                reason: f.reason || ''
            })),
            explanation,
            status: 'open',
            modelUsed: fraudResult.model_used,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        await (0, firestore_1.createDocument)('fraudSignals', fraudSignalData);
        logger_1.logger.info({
            service: 'claims-orchestrator',
            operation: 'fraud-signal-created',
            claimId,
            message: 'Fraud signal document created',
            metadata: {
                severity,
                signalType,
                anomalyScore: anomaly_score
            }
        });
    }
    catch (error) {
        logger_1.logger.error({
            service: 'claims-orchestrator',
            operation: 'fraud-signal-creation-error',
            claimId,
            message: `Failed to create fraud signal: ${error.message}`
        });
        // Don't throw - fraud signal creation failure shouldn't block claim processing
    }
}
/**
 * Generate plain-language explanation of fraud detection
 */
function generateFraudExplanation(fraudResult, signalVector) {
    const { anomaly_score, top_contributing_features } = fraudResult;
    if (anomaly_score >= 0.9) {
        return `Critical fraud risk detected. ${top_contributing_features.map(f => f.reason || f.feature).join('. ')}.`;
    }
    else if (anomaly_score >= 0.7) {
        return `High fraud risk detected. ${top_contributing_features.map(f => f.reason || f.feature).join('. ')}.`;
    }
    else if (anomaly_score >= 0.3) {
        return `Medium fraud risk detected. ${top_contributing_features.map(f => f.reason || f.feature).join('. ')}.`;
    }
    return 'Low fraud risk detected.';
}
/**
 * Determine signal type based on contributing features
 */
function determineSignalType(contributingFeatures) {
    const featureNames = contributingFeatures.map(f => f.feature.toLowerCase());
    if (featureNames.some(f => f.includes('emulator'))) {
        return 'emulator';
    }
    if (featureNames.some(f => f.includes('speed') || f.includes('location'))) {
        return 'location_spoofing';
    }
    if (featureNames.some(f => f.includes('duplicate') || f.includes('frequency'))) {
        return 'duplicate_claim';
    }
    if (featureNames.some(f => f.includes('ring') || f.includes('coordinated'))) {
        return 'fraud_ring';
    }
    return 'suspicious_pattern';
}
/**
 * Check for duplicate claims (same workerId + triggerEventId)
 */
async function checkDuplicateClaim(workerId, triggerEventId) {
    const db = admin.firestore();
    try {
        const existingClaims = await db.collection('claims')
            .where('workerId', '==', workerId)
            .where('triggerEventId', '==', triggerEventId)
            .limit(1)
            .get();
        return !existingClaims.empty;
    }
    catch (error) {
        logger_1.logger.error({
            service: 'claims-orchestrator',
            operation: 'check-duplicate-claim-error',
            workerId,
            triggerEventId,
            message: error.message
        });
        return false;
    }
}
/**
 * Check for coordinated fraud rings (>50 claims in same zone within 3 minutes)
 */
async function checkFraudRing(zone, city) {
    const db = admin.firestore();
    try {
        const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
        const recentClaims = await db.collection('claims')
            .where('zone', '==', zone)
            .where('city', '==', city)
            .where('createdAt', '>=', threeMinutesAgo)
            .get();
        const claimCount = recentClaims.size;
        const isFraudRing = claimCount > 50;
        if (isFraudRing) {
            logger_1.logger.warn({
                service: 'claims-orchestrator',
                operation: 'fraud-ring-detected',
                zone,
                city,
                message: `Potential fraud ring detected: ${claimCount} claims in 3 minutes`,
                metadata: { claimCount }
            });
        }
        return { isFraudRing, claimCount };
    }
    catch (error) {
        logger_1.logger.error({
            service: 'claims-orchestrator',
            operation: 'check-fraud-ring-error',
            zone,
            city,
            message: error.message
        });
        return { isFraudRing: false, claimCount: 0 };
    }
}
//# sourceMappingURL=fraudDetection.js.map