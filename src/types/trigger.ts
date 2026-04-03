import { BaseDocument, FirestoreTimestamp } from "./firestore";

// ─── Enums ────────────────────────────────────────────────────────────────────

/** Parametric trigger type — the external disruption category. */
export type TriggerType =
  | "heavy_rain"
  | "extreme_heat"
  | "hazardous_aqi"
  | "zone_closure"
  | "platform_outage";

/** Severity level of a trigger event. */
export type TriggerSeverity = "moderate" | "high" | "severe";

/** Outcome after evaluating a trigger event against policies. */
export type TriggerResult = "auto_approved" | "under_review" | "manual_override";

// ─── TriggerEvent Document ───────────────────────────────────────────────────

/**
 * Firestore collection: `triggerEvents`
 *
 * Records a detected parametric disruption event.
 * Written by the Trigger Monitoring Engine (Cloud Function) whenever
 * an external data feed crosses a configured threshold.
 *
 * Every trigger writes a complete audit trail: source feed, raw value,
 * threshold applied, timestamp, affected zone, and resulting action.
 */
export interface TriggerEvent extends BaseDocument {
  /** Disruption category. */
  type: TriggerType;

  /** Event severity level. */
  severity: TriggerSeverity;

  /** Affected delivery zone name. */
  zone: string;

  /** City the zone belongs to. */
  city: string;

  /** When the disruption started. */
  startTime: FirestoreTimestamp;

  /** When the disruption ended. `null` if still ongoing. */
  endTime: FirestoreTimestamp | null;

  /** Human-readable description of the event. */
  details: string;

  /** Estimated number of active workers affected in the zone. */
  affectedWorkers: number;

  /**
   * AI-computed confidence that this trigger is genuine (0 – 1).
   * `null` if not yet scored.
   */
  confidenceScore: number | null;

  /**
   * Claim processing result after evaluation.
   * `null` if evaluation hasn't completed.
   */
  result: TriggerResult | null;

  // ── Audit fields (per README architecture principles) ──

  /** Name of the data feed source, e.g. "open-meteo", "mock-weather". */
  source: string;

  /** Raw measurement value from the feed (e.g. rainfall mm/hr, AQI). */
  rawValue: number | null;

  /** Threshold value that was applied to decide activation. */
  thresholdApplied: number | null;
}
