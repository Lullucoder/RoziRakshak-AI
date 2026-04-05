/**
 * STEP 3: Call Fraud Detection
 * Calls ML service or uses fallback rules
 */

import fetch from 'node-fetch';
import * as admin from 'firebase-admin';
import { FraudSignalVector, FraudDetectionResponse } from '../types/fraud';
import { logger } from '../utils/logger';
import { createDocument } from '../utils/firestore';

const ML_SERVICE_URL = process.env.RENDER_ML_URL || 'https://ml-microservice-api.onrender.com';
const FRAUD_TIMEOUT_MS = 5000;

interface MLFraudResponse {
  anomaly_score: number;
  is_suspicious: boolean;
  suspicion_level?: 'low' | 'medium' | 'high';
  flags?: string[];
  recommended_track?: string;
  model_used?: string;
}

function mapSignalVectorToFraudPayload(signalVector: FraudSignalVector) {
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
  };
}

function normalizeRiskLevel(score: number, level?: string): 'low' | 'medium' | 'high' {
  if (level === 'low' || level === 'medium' || level === 'high') {
    return level;
  }

  if (score >= 0.7) return 'high';
  if (score >= 0.3) return 'medium';
  return 'low';
}

function mapMlFraudResponse(claimId: string, result: MLFraudResponse): FraudDetectionResponse {
  const anomaly_score = Number.isFinite(result.anomaly_score) ? result.anomaly_score : 0.5;
  const risk_level = normalizeRiskLevel(anomaly_score, result.suspicion_level);
  const flags = (result.flags ?? []).filter(Boolean);

  return {
    request_id: claimId,
    status: 'success',
    claim_id: claimId,
    anomaly_score,
    risk_level,
    is_suspicious: Boolean(result.is_suspicious ?? anomaly_score >= 0.4),
    top_contributing_features: (flags.length > 0 ? flags : ['Anomalous pattern detected'])
      .slice(0, 5)
      .map((flag) => ({
        feature: flag,
        contribution: 1.0,
        reason: flag,
      })),
    model_used: result.model_used === 'isolation_forest' ? 'isolation_forest' : 'fallback_rules',
    fallback_rules_triggered:
      result.model_used && result.model_used !== 'isolation_forest' ? flags : undefined,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Call fraud detection ML service with fallback logic
 */
export async function callFraudDetection(
  claimId: string,
  signalVector: FraudSignalVector
): Promise<FraudDetectionResponse> {
  logger.info({
    service: 'claims-orchestrator',
    operation: 'fraud-detection',
    claimId,
    message: 'Calling fraud detection service'
  });
  
  try {
    const mlPayload = mapSignalVectorToFraudPayload(signalVector);

    // Call ML service with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FRAUD_TIMEOUT_MS);
    
    const response = await fetch(`${ML_SERVICE_URL}/fraud/score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(mlPayload),
      signal: controller.signal as any
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`ML service returned ${response.status}`);
    }
    
    const result = mapMlFraudResponse(claimId, await response.json() as MLFraudResponse);
    
    logger.info({
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
    
  } catch (error: any) {
    logger.warn({
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
function useFraudFallbackRules(
  claimId: string,
  signalVector: FraudSignalVector
): FraudDetectionResponse {
  const fallbackRules: string[] = [];
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
  
  const risk_level: 'low' | 'medium' | 'high' = 
    anomaly_score >= 0.7 ? 'high' : 
    anomaly_score >= 0.3 ? 'medium' : 'low';
  
  logger.info({
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
async function createFraudSignalIfNeeded(
  claimId: string,
  fraudResult: FraudDetectionResponse,
  signalVector: FraudSignalVector
): Promise<void> {
  const { anomaly_score, top_contributing_features } = fraudResult;
  
  // Only create fraud signals for medium or higher risk
  if (anomaly_score < 0.3) {
    return;
  }
  
  // Determine severity based on anomaly score
  let severity: 'low' | 'medium' | 'high' | 'critical';
  if (anomaly_score >= 0.9) {
    severity = 'critical';
  } else if (anomaly_score >= 0.7) {
    severity = 'high';
  } else if (anomaly_score >= 0.3) {
    severity = 'medium';
  } else {
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
    
    await createDocument('fraudSignals', fraudSignalData);
    
    logger.info({
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
  } catch (error: any) {
    logger.error({
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
function generateFraudExplanation(
  fraudResult: FraudDetectionResponse,
  signalVector: FraudSignalVector
): string {
  const { anomaly_score, top_contributing_features } = fraudResult;
  
  if (anomaly_score >= 0.9) {
    return `Critical fraud risk detected. ${top_contributing_features.map(f => f.reason || f.feature).join('. ')}.`;
  } else if (anomaly_score >= 0.7) {
    return `High fraud risk detected. ${top_contributing_features.map(f => f.reason || f.feature).join('. ')}.`;
  } else if (anomaly_score >= 0.3) {
    return `Medium fraud risk detected. ${top_contributing_features.map(f => f.reason || f.feature).join('. ')}.`;
  }
  
  return 'Low fraud risk detected.';
}

/**
 * Determine signal type based on contributing features
 */
function determineSignalType(
  contributingFeatures: Array<{ feature: string; contribution: number; reason?: string }>
): 'emulator' | 'location_spoofing' | 'duplicate_claim' | 'fraud_ring' | 'suspicious_pattern' {
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
export async function checkDuplicateClaim(
  workerId: string,
  triggerEventId: string
): Promise<boolean> {
  const db = admin.firestore();
  
  try {
    const existingClaims = await db.collection('claims')
      .where('workerId', '==', workerId)
      .where('triggerEventId', '==', triggerEventId)
      .limit(1)
      .get();
    
    return !existingClaims.empty;
  } catch (error: any) {
    logger.error({
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
export async function checkFraudRing(
  zone: string,
  city: string
): Promise<{ isFraudRing: boolean; claimCount: number }> {
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
      logger.warn({
        service: 'claims-orchestrator',
        operation: 'fraud-ring-detected',
        zone,
        city,
        message: `Potential fraud ring detected: ${claimCount} claims in 3 minutes`,
        metadata: { claimCount }
      });
    }
    
    return { isFraudRing, claimCount };
  } catch (error: any) {
    logger.error({
      service: 'claims-orchestrator',
      operation: 'check-fraud-ring-error',
      zone,
      city,
      message: error.message
    });
    return { isFraudRing: false, claimCount: 0 };
  }
}
