import { BaseDocument } from "./firestore";

// ─── Enums ────────────────────────────────────────────────────────────────────

/** Severity level of a fraud signal. */
export type FraudSeverity = "low" | "medium" | "high" | "critical";

/** Investigation status of a fraud signal. */
export type FraudStatus = "open" | "investigating" | "resolved" | "dismissed";

// ─── FraudSignal Document ────────────────────────────────────────────────────

/**
 * Firestore collection: `fraudSignals`
 *
 * Records an AI-detected anomaly from the anti-spoofing / fraud
 * detection pipeline. Each signal is tied to a specific claim and
 * is surfaced in the admin fraud review queue.
 *
 * Signal types include: GPS-WiFi Mismatch, Impossible Speed,
 * Device Fingerprint Collision, Emulator Detected, Density Anomaly, etc.
 */
export interface FraudSignal extends BaseDocument {
  /** Worker flagged by the signal. */
  workerId: string;

  /** Worker display name (denormalised for admin UI). */
  workerName: string;

  /** Claim that triggered this fraud check. */
  claimId: string;

  /**
   * Category of the anomaly detected.
   * e.g. "GPS-WiFi Mismatch", "Impossible Speed", "Emulator Detected".
   */
  signalType: string;

  /** How severe the anomaly is. */
  severity: FraudSeverity;

  /** Detailed human-readable explanation of the signal. */
  details: string;

  /** Current investigation status. */
  status: FraudStatus;
}
