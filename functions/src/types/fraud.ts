import { Timestamp } from 'firebase-admin/firestore';

/**
 * Fraud Signal Vector - 20 features for ML fraud detection
 */
export interface FraudSignalVector {
  // Device signals (safe defaults for unavailable data)
  motion_variance: number;              // Default: 5.0
  network_type: string;                 // Default: "cellular" (1)
  rtt_ms: number;                       // Default: 200
  gps_accuracy_m: number;               // Default: 50
  emulator_flag: boolean;               // Default: false
  shared_device_count: number;          // Default: 0
  
  // Location signals
  distance_from_home_km: number;        // Default: 2.0
  route_continuity_score: number;       // Default: 0.8
  speed_between_pings_kmh: number;      // Default: 25
  
  // Behavioral signals
  claim_frequency_7d: number;           // Computed from Firestore
  days_since_registration: number;      // From worker profile
  payout_account_change_days: number;   // Days since UPI change
  simultaneous_claim_density_ratio: number; // Default: 1.0
  claim_timestamp_cluster_size: number; // Claims in 3-minute window
  
  // Advanced fraud indicators
  mock_location_flag: boolean;          // Default: false
  wifi_vs_cellular: string;             // "wifi", "cellular", "mixed"
  gps_accuracy_stddev: number;          // GPS accuracy variation
  teleportation_flag: boolean;          // Impossible movement detected
  zone_entry_plausibility: number;      // Entry path likelihood (0-1)
  historical_zone_match: boolean;       // Matches typical zones
}

/**
 * Fraud Detection Response from ML Service
 */
export interface FraudDetectionResponse {
  request_id: string;
  status: 'success' | 'error';
  claim_id: string;
  anomaly_score: number;                // 0.0 - 1.0
  risk_level: 'low' | 'medium' | 'high';
  is_suspicious: boolean;
  top_contributing_features: Array<{
    feature: string;
    contribution: number;
    reason: string;
  }>;
  model_used: 'isolation_forest' | 'fallback_rules';
  fallback_rules_triggered?: string[];
  timestamp: string;
}

/**
 * Confidence Score Features - 9 features for ML confidence scoring
 */
export interface ConfidenceScoreFeatures {
  trigger_confirmed: boolean;
  zone_overlap_score: number;           // 0.0-1.0
  emulator_flag: boolean;
  speed_plausible: boolean;
  duplicate_check_passed: boolean;
  fraud_anomaly_score: number;          // From fraud detection
  historical_trust_score: number;       // From worker profile
  claim_frequency_7d: number;
  device_consistency_score: number;     // 0.0-1.0
}

/**
 * Confidence Score Response from ML Service
 */
export interface ConfidenceScoreResponse {
  request_id: string;
  status: 'success' | 'error';
  claim_id: string;
  confidence_score: number;             // 0.0 - 1.0
  decision_track: 'auto_approve' | 'soft_review' | 'hold';
  top_contributing_features: Array<{
    feature: string;
    coefficient: number;
    reason: string;
  }>;
  model_used: 'logistic_regression' | 'fallback_rules';
  fallback_checks?: {
    trigger_confirmed: boolean;
    zone_overlap: boolean;
    no_emulator: boolean;
    speed_plausible: boolean;
    no_duplicate: boolean;
  };
  timestamp: string;
}

/**
 * Fraud Signal Types
 */
export type FraudSignalType = 
  | 'gps_spoofing'
  | 'impossible_speed'
  | 'emulator_detected'
  | 'mock_location'
  | 'excessive_frequency'
  | 'coordinated_ring'
  | 'device_sharing'
  | 'teleportation'
  | 'wifi_home_mismatch'
  | 'zone_mismatch'
  | 'suspicious_pattern';

/**
 * Fraud Signal Document Schema
 */
export interface FraudSignal {
  id: string;
  claimId: string;
  workerId: string;
  signalType: FraudSignalType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  anomalyScore: number;                 // 0.0-1.0
  details: string;                      // Plain-language explanation
  contributingFeatures: Array<{
    feature: string;
    value: any;
    contribution: number;
    reason: string;
  }>;
  modelUsed: 'isolation_forest' | 'fallback_rules';
  status: 'open' | 'investigating' | 'resolved' | 'dismissed';
  resolvedBy: string | null;            // Admin UID
  resolvedAt: Timestamp | null;
  dismissalReason: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * ML Service Error Response
 */
export interface MLServiceError {
  request_id: string;
  status: 'error';
  error_code: string;
  error_message: string;
  timestamp: string;
}
