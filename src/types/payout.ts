import { BaseDocument, FirestoreTimestamp } from "./firestore";

// ─── Enums ────────────────────────────────────────────────────────────────────

/** Method used to disburse the payout. */
export type PayoutMethod = "upi" | "wallet" | "bank_transfer";

/** Lifecycle status of a payout transaction. */
export type PayoutStatus = "pending" | "processing" | "completed" | "failed";

// ─── Payout Document ─────────────────────────────────────────────────────────

/**
 * Firestore collection: `payouts`
 *
 * Records a simulated (or live) payout to a worker after a claim
 * is approved. Integrates with Razorpay test mode for UPI simulation.
 */
export interface Payout extends BaseDocument {
  /** Claim that this payout settles. */
  claimId: string;

  /** Worker receiving the payout. */
  workerId: string;

  /** Policy under which the claim was filed. */
  policyId: string;

  /** Payout amount in ₹. */
  amount: number;

  /** Disbursement method. */
  method: PayoutMethod;

  /** UPI virtual payment address (when method is "upi"). */
  upiId: string | null;

  /** Current transaction status. */
  status: PayoutStatus;

  /** Razorpay payout ID from test/live API response. */
  razorpayPayoutId: string | null;

  /** Razorpay webhook status string (e.g. "processed", "reversed"). */
  razorpayStatus: string | null;

  /** Reason for failure, if status is "failed". */
  failureReason: string | null;

  /** Timestamp when funds were confirmed disbursed. `null` if not yet paid. */
  paidAt: FirestoreTimestamp | null;
}
