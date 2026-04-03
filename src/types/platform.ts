import { BaseDocument, FirestoreTimestamp } from "./firestore";

// ─── PlatformActivityFeed Document ───────────────────────────────────────────

/**
 * Firestore collection: `platformActivityFeeds`
 *
 * Stores hourly snapshots of platform order volume per zone.
 * Consumed by the Trigger Monitoring Engine to detect platform outages
 * and abnormal order collapses.
 *
 * In the prototype, these are generated from static JSON mock data.
 * In production, they would be ingested from real platform partner APIs.
 */
export interface PlatformActivityFeed extends BaseDocument {
  /** City the feed covers. */
  city: string;

  /** Specific delivery zone. */
  zone: string;

  /** Hourly time slot this data point represents. */
  hour: FirestoreTimestamp;

  /**
   * Normalised order volume index (0 – 100).
   * 100 = peak expected volume; 0 = total outage.
   */
  orderVolumeIndex: number;

  /** Whether this data point indicates a disruption condition. */
  isDisrupted: boolean;

  /** Name of the data source, e.g. "mock-platform-ops", "zepto-api". */
  feedSource: string;

  /** Raw JSON payload from the feed, stored for audit purposes. */
  rawPayload: Record<string, unknown> | null;
}
