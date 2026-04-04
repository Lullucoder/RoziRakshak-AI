import { Timestamp } from 'firebase-admin/firestore';

/**
 * Trigger Types - Parametric events that can initiate claims
 */
export type TriggerType = 
  | 'heavy_rain' 
  | 'hazardous_aqi' 
  | 'extreme_heat' 
  | 'zone_closure' 
  | 'platform_outage';

/**
 * Trigger Severity Levels
 */
export type TriggerSeverity = 'moderate' | 'high' | 'severe';

/**
 * Claim Status Lifecycle
 */
export type ClaimStatus = 
  | 'pending_fraud_check'  // Initial status when claim is created
  | 'under_review'         // Track B: Soft review (confidence 0.40-0.75)
  | 'auto_approved'        // Track A: Auto-approved (confidence ≥ 0.75)
  | 'approved'             // Manually approved by admin
  | 'held'                 // Track C: Held for investigation (confidence < 0.40)
  | 'denied'               // Rejected by admin or system
  | 'payout_initiated'     // Payout service has been invoked
  | 'paid'                 // Payout completed successfully
  | 'error';               // System error during processing

/**
 * Decision Track for claim routing
 */
export type DecisionTrack = 'track_a' | 'track_b' | 'track_c';

/**
 * Claim Document Schema
 */
export interface Claim {
  id: string;
  workerId: string;
  workerName: string;              // Denormalized for display
  policyId: string;
  triggerEventId: string;
  triggerType: TriggerType;
  triggerSeverity: TriggerSeverity;
  zone: string;
  city: string;
  description: string;             // Human-readable description
  status: ClaimStatus;
  confidenceScore: number | null;  // 0.0-1.0
  payoutAmount: number;            // In rupees
  payoutId: string | null;
  resolvedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  
  // Fraud analysis results
  fraudScore: number | null;
  fraudRiskLevel: 'low' | 'medium' | 'high' | null;
  fraudSignalIds: string[];
  
  // Confidence scoring details
  decisionTrack: DecisionTrack | null;
  topContributingFeatures: Array<{
    feature: string;
    value: number;
    reason: string;
  }>;
  
  // Track C specific
  holdReason: string | null;
  appealSubmitted: boolean;
  appealText: string | null;
  appealedAt: Timestamp | null;
}

/**
 * Claim Context - All data needed for orchestration
 */
export interface ClaimContext {
  claim: Claim;
  triggerEvent: TriggerEvent;
  worker: WorkerProfile;
  policy: Policy;
}

/**
 * Trigger Event Document Schema
 */
export interface TriggerEvent {
  id: string;
  type: TriggerType;
  severity: TriggerSeverity;
  zone: string;
  city: string;
  startTime: Timestamp;
  endTime: Timestamp | null;       // null if ongoing
  
  // Source data audit trail
  sourceFeed: string;              // e.g., "OpenWeatherMap", "AQI_API"
  rawMeasurementValue: number;     // e.g., 65 (mm/hour for rain)
  thresholdApplied: number;        // e.g., 50 (mm/hour)
  measurementUnit: string;         // e.g., "mm/hour", "AQI", "°C"
  
  // Impact assessment
  affectedWorkersCount: number;
  claimIds: string[];              // Claims created from this trigger
  
  // Status
  status: 'active' | 'resolved';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Worker Profile Document Schema
 */
export interface WorkerProfile {
  uid: string;
  name: string;
  phone: string;
  email: string | null;
  upiId: string;
  razorpayFundAccountId: string | null;
  
  // Work details
  platform: 'swiggy' | 'zomato' | 'uber_eats' | 'dunzo';
  zone: string;
  city: string;
  workingHours: 'morning' | 'afternoon' | 'evening' | 'full_day';
  
  // Trust and fraud metrics
  trustScore: number;              // 0.0-1.0
  claimCount: number;
  totalPayoutsReceived: number;
  accountStatus: 'active' | 'suspended' | 'under_review';
  
  // Device fingerprint
  deviceFingerprint: string | null;
  lastKnownLocation: {
    lat: number;
    lng: number;
    timestamp: Timestamp;
  } | null;
  
  // Timestamps
  joinedDate: Timestamp;
  lastActiveAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Policy Document Schema
 */
export interface Policy {
  id: string;
  workerId: string;
  tier: 'lite' | 'core' | 'peak';
  premium: number;
  maxProtection: number;
  zone: string;
  city: string;
  weekStart: Timestamp;
  weekEnd: Timestamp;
  status: 'active' | 'expired' | 'cancelled';
  purchasedAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Weekly Coverage Document Schema
 */
export interface WeeklyCoverage {
  id: string;
  policyId: string;
  workerId: string;
  weekStart: Timestamp;
  weekEnd: Timestamp;
  premium: number;
  maxProtection: number;
  totalPaidOut: number;
  claimIds: string[];
  status: 'active' | 'claimed' | 'expired';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
