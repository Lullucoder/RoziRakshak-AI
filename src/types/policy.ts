import { BaseDocument, FirestoreTimestamp } from "./firestore";
import { PlanTier } from "./worker";
import { TriggerType } from "./trigger";

// ─── Enums ────────────────────────────────────────────────────────────────────

/** Lifecycle status of a weekly policy. */
export type PolicyStatus = "active" | "expired" | "cancelled";

/** Lifecycle status of a weekly coverage instance. */
export type CoverageStatus = "active" | "expired" | "claimed";

// ─── Policy Document ─────────────────────────────────────────────────────────

/**
 * Firestore collection: `policies`
 *
 * A purchased weekly insurance policy for a worker.
 * One worker may have many policies over time but only one active per week.
 */
export interface Policy extends BaseDocument {
  /** Worker who purchased this policy. */
  workerId: string;

  /** Selected plan tier. */
  plan: PlanTier;

  /** Personalised weekly premium in ₹. */
  premium: number;

  /** Maximum payout ceiling for this week in ₹. */
  maxProtection: number;

  /** ISO start of the covered week (Monday 00:00 IST). */
  weekStart: FirestoreTimestamp;

  /** ISO end of the covered week (Sunday 23:59 IST). */
  weekEnd: FirestoreTimestamp;

  /** Current policy status. */
  status: PolicyStatus;

  /** Parametric trigger types covered by this policy. */
  triggers: TriggerType[];
}

// ─── WeeklyCoverage Document ─────────────────────────────────────────────────

/**
 * Firestore collection: `weeklyCoverages`
 *
 * Tracks the actual coverage period and payout state for a worker's
 * active week. Linked to a Policy; may link to multiple Claims.
 */
export interface WeeklyCoverage extends BaseDocument {
  /** Worker this coverage belongs to. */
  workerId: string;

  /** Parent policy document ID. */
  policyId: string;

  /** Start of covered week. */
  weekStart: FirestoreTimestamp;

  /** End of covered week. */
  weekEnd: FirestoreTimestamp;

  /** Premium amount actually paid by the worker (₹). */
  premiumPaid: number;

  /** Maximum payout ceiling for the week (₹). */
  maxProtection: number;

  /** Current status of this coverage. */
  status: CoverageStatus;

  /** Total amount already paid out under this coverage (₹). */
  totalPaidOut: number;

  /** IDs of claims raised against this coverage. */
  claimIds: string[];
}
