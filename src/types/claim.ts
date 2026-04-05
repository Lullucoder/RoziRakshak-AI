import { BaseDocument, FirestoreTimestamp } from "./firestore";
import { TriggerType, TriggerSeverity } from "./trigger";

// ─── Enums ────────────────────────────────────────────────────────────────────

/** Lifecycle status of a parametric claim. */
export type ClaimStatus =
  | "pending_fraud_check"
  | "auto_approved"
  | "soft_review"
  | "under_review"
  | "approved"
  | "under_appeal"
  | "payout_initiated"
  | "payout_failed"
  | "paid"
  | "held"
  | "denied"
  | "rejected"
  | "error";

// ─── Claim Document ──────────────────────────────────────────────────────────

/**
 * Firestore collection: `claims`
 *
 * An auto-initiated parametric claim created when a verified trigger
 * event affects a worker with an active policy.
 */
export interface Claim extends BaseDocument {
  /** Worker who is the subject of this claim. */
  workerId: string;

  /** Worker display name (denormalised for quick display). */
  workerName: string;

  /** Policy under which this claim is filed. */
  policyId: string;

  /** Trigger event that initiated this claim. */
  triggerEventId: string | null;

  /** Category of the triggering disruption. */
  triggerType: TriggerType;

  /** Severity of the triggering disruption. */
  triggerSeverity: TriggerSeverity;

  /** Current claim processing status. */
  status: ClaimStatus;

  /**
   * AI-computed confidence score (0 – 1).
   *
   * - ≥ 0.75 → Track A (auto-approved)
   * - 0.40 – 0.74 → Track B (soft review, 2-hour window)
   * - < 0.40 → Track C (held for investigation)
   */
  confidenceScore: number | null;

  /** Calculated payout amount in ₹. 0 if not yet determined or denied. */
  payoutAmount: number;

  /** Linked payout document ID, or `null` if payout not yet created. */
  payoutId: string | null;

  /** Affected delivery zone name. */
  zone: string;

  /** Claim city for admin filtering and analytics views. */
  city?: string;

  /** Human-readable claim description / reason. */
  description: string;

  /** When the claim was resolved (approved / denied). `null` if pending. */
  resolvedAt: FirestoreTimestamp | null;

  /** Optional reason shown when a claim is held or errored. */
  holdReason?: string | null;
}
