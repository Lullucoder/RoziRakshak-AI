import { Timestamp } from 'firebase-admin/firestore';

/**
 * Payout Status Lifecycle
 */
export type PayoutStatus = 
  | 'pending'      // Payout document created, not yet sent to Razorpay
  | 'processing'   // Sent to Razorpay, awaiting confirmation
  | 'completed'    // Successfully paid
  | 'failed';      // Payment failed

/**
 * Payout Document Schema
 */
export interface Payout {
  id: string;
  claimId: string;
  workerId: string;
  workerName: string;
  policyId?: string;
  amount: number;                  // In rupees
  currency: string;                // "INR"
  method: 'upi';
  upiId: string;
  status: PayoutStatus;
  razorpayPayoutId: string | null;
  razorpayFundAccountId: string | null;
  razorpayReferenceId: string;
  razorpayStatus: string | null;
  failureReason: string | null;
  retryCount: number;
  paidAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

/**
 * Razorpay Payout API Request
 */
export interface RazorpayPayoutRequest {
  account_number: string;
  fund_account_id: string;
  amount: number;                  // In paise (multiply rupees by 100)
  currency: string;                // "INR"
  mode: string;                    // "UPI"
  purpose: string;                 // "payout"
  reference_id: string;            // Claim ID for tracking
  queue_if_low_balance?: boolean;
  narration?: string;
}

/**
 * Razorpay Payout API Response
 */
export interface RazorpayPayoutResponse {
  id: string;                      // Razorpay payout ID
  entity: string;                  // "payout"
  fund_account_id: string;
  amount: number;                  // In paise
  currency: string;
  status: string;                  // "processing", "processed", "reversed", "failed"
  purpose: string;
  utr: string | null;              // Unique Transaction Reference
  mode: string;
  reference_id: string;
  narration: string | null;
  batch_id: string | null;
  failure_reason: string | null;
  created_at: number;              // Unix timestamp
}

/**
 * Razorpay Webhook Event
 */
export interface RazorpayWebhookEvent {
  entity: string;                  // "event"
  account_id: string;
  event: string;                   // "payout.processed", "payout.failed", "payout.reversed"
  contains: string[];
  payload: {
    payout: {
      entity: RazorpayPayoutResponse;
    };
  };
  created_at: number;
}

/**
 * Payout Retry Document Schema
 */
export interface PayoutRetry {
  id: string;
  payoutId: string;
  attemptNumber: number;           // 1, 2, or 3
  scheduledAt: Timestamp;
  executedAt: Timestamp | null;
  status: 'pending' | 'executed' | 'failed';
  errorMessage: string | null;
  createdAt: Timestamp;
}
