import { BaseDocument } from "./firestore";
import { TriggerType } from "./trigger";

// ─── GeoJSON Geometry (lightweight inline definition) ─────────────────────────

/**
 * Minimal GeoJSON Geometry type for zone boundaries.
 * Avoids adding @types/geojson as a dependency.
 */
export interface GeoJsonGeometry {
  type: "Point" | "MultiPoint" | "LineString" | "MultiLineString" | "Polygon" | "MultiPolygon" | "GeometryCollection";
  coordinates: unknown;
}

// ─── Zone Document ───────────────────────────────────────────────────────────

/**
 * Firestore collection: `zones`
 *
 * Defines a delivery micro-zone used for geofencing, trigger mapping,
 * and risk analytics. Zone boundaries are stored as GeoJSON and cached
 * in the PWA service worker for client-side point-in-polygon checks.
 */
export interface Zone extends BaseDocument {
  /** Human-readable zone name, e.g. "Koramangala", "Anand Vihar". */
  name: string;

  /** City the zone belongs to. */
  city: string;

  /** GeoJSON boundary geometry. `null` if not yet mapped. */
  geojson: GeoJsonGeometry | null;

  /**
   * Composite risk score for this zone (0 – 1).
   * Computed from historical disruption frequency and severity.
   */
  riskScore: number;

  /**
   * Trigger density percentage (0 – 100).
   * Indicates how concentrated trigger events are in this zone.
   */
  triggerDensity: number;

  /** Count of currently active workers in this zone. */
  activeWorkers: number;

  /** Most frequent trigger type in this zone, or `null` if no data. */
  topTriggerType: TriggerType | null;

  /** Whether this zone is currently active for policy coverage. */
  isActive: boolean;
}
