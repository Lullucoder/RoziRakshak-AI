/**
 * lib/triggers.ts — Pure trigger evaluation logic.
 *
 * This module contains ZERO Firestore imports, ZERO side effects, and ZERO
 * external dependencies. Every function takes data in and returns data out.
 * All threshold constants, severity classifications, and evaluation logic
 * live here. The Cloud Function (functions/triggerMonitor.ts) is the only
 * consumer that performs Firestore writes.
 */

// ═══════════════════════════════════════════════════════════════════════════════
//  TYPES — Feed reading shapes (match public/mocks/ JSON schemas)
// ═══════════════════════════════════════════════════════════════════════════════

export interface RainfallReading {
  zone_id: string;
  city: string;
  timestamp: string; // ISO 8601
  rainfall_mm_per_hr: number;
  cumulative_6hr_mm: number;
  alert_level: string;
}

export interface HeatReading {
  zone_id: string;
  city: string;
  timestamp: string;
  temperature_c: number;
  humidity_pct: number;
}

export interface AqiReading {
  zone_id: string;
  city: string;
  timestamp: string;
  aqi: number;
  category: string;
  dominant_pollutant: string;
  sustained_hours_above_300: number;
}

export interface ZoneClosureEntry {
  zone_id: string;
  city: string;
  zone_closure?: boolean;
  reason?: string;
  [key: string]: unknown;
}

export interface PlatformReading {
  zone_id: string;
  city: string;
  platform: string;
  timestamp: string;
  order_volume_index: number;
  expected_volume_index: number;
  drop_pct: number;
  driver_online_count: number;
}

/** All five feed payloads bundled for evaluateAllTriggers(). */
export interface AllFeedData {
  weather: { readings: RainfallReading[] };
  heat: { readings: HeatReading[] };
  aqi: { readings: AqiReading[] };
  zones: { zones: ZoneClosureEntry[] };
  platform: { readings: PlatformReading[] };
}

// ── Trigger result returned by every evaluator ──────────────────────────────

export type Severity = "moderate" | "high" | "severe";

export type TriggerType =
  | "heavy_rain"
  | "extreme_heat"
  | "hazardous_aqi"
  | "zone_closure"
  | "platform_outage";

export interface TriggerEvalResult {
  triggered: boolean;
  zone_id: string;
  trigger_type: TriggerType;
  severity: Severity;
  raw_value: number;
  threshold_applied: number;
  timestamp: string;
  details: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CONSTANTS — Threshold values for each trigger type
// ═══════════════════════════════════════════════════════════════════════════════

export const THRESHOLDS = {
  rainfall: {
    /** mm/hr — any reading above this fires a trigger */
    trigger: 35,
    /** Severity bands (mm/hr) */
    moderate_max: 50,
    high_max: 80,
  },
  heat: {
    /** °C — NOAA heat index above this fires a trigger */
    trigger: 42,
    /** Severity bands (°C heat index) */
    moderate_max: 47,
    high_max: 54,
    /** Only evaluate during IST working hours */
    working_hours_start: 11, // 11:00 IST
    working_hours_end: 17, // 17:00 IST
  },
  aqi: {
    /** AQI value above which readings count toward sustained window */
    trigger: 300,
    /** Minimum consecutive hours above trigger to fire */
    sustained_hours: 2,
    /** Severity bands (AQI value) */
    moderate_max: 400,
    high_max: 500,
  },
  platform: {
    /** Order volume index at or below which readings count as disrupted */
    trigger: 20,
    /** Minimum consecutive disrupted hours to fire */
    sustained_hours: 3,
    /** Severity bands based on lowest volume index in the window */
    moderate_min: 10,
    high_min: 5,
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
//  HELPERS — Pure utility functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compute the NOAA heat index from temperature and relative humidity
 * using the Rothfusz regression equation.
 *
 * @param tempC  — Ambient temperature in °C
 * @param rhPct  — Relative humidity in % (0–100)
 * @returns Heat index in °C
 *
 * Reference: https://www.wpc.ncep.noaa.gov/html/heatindex_equation.shtml
 */
export function computeHeatIndex(tempC: number, rhPct: number): number {
  // Convert Celsius → Fahrenheit for the NOAA formula
  const T = tempC * 1.8 + 32;
  const RH = rhPct;

  // Step 1: Simple formula (Steadman, 1979)
  let HI = 0.5 * (T + 61.0 + (T - 68.0) * 1.2 + RH * 0.094);

  // Step 2: If the simple average ≥ 80 °F, apply full Rothfusz regression
  if (HI >= 80) {
    HI =
      -42.379 +
      2.04901523 * T +
      10.14333127 * RH -
      0.22475541 * T * RH -
      0.00683783 * T * T -
      0.05481717 * RH * RH +
      0.00122874 * T * T * RH +
      0.00085282 * T * RH * RH -
      0.00000199 * T * T * RH * RH;

    // Adjustment for low humidity
    if (RH < 13 && T >= 80 && T <= 112) {
      HI -= ((13 - RH) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
    }

    // Adjustment for high humidity
    if (RH > 85 && T >= 80 && T <= 87) {
      HI += ((RH - 85) / 10) * ((87 - T) / 5);
    }
  }

  // Convert Fahrenheit → Celsius
  return (HI - 32) * (5 / 9);
}

/**
 * Extract the IST hour (0–23) from an ISO 8601 UTC timestamp.
 * IST = UTC + 5 hours 30 minutes.
 */
export function getISTHour(utcTimestamp: string): number {
  const d = new Date(utcTimestamp);
  const totalMinutesIST = d.getUTCHours() * 60 + d.getUTCMinutes() + 330;
  return Math.floor(totalMinutesIST / 60) % 24;
}

/**
 * Classify rainfall severity from mm/hr.
 */
function classifyRainfallSeverity(mmPerHr: number): Severity {
  if (mmPerHr > THRESHOLDS.rainfall.high_max) return "severe";
  if (mmPerHr > THRESHOLDS.rainfall.moderate_max) return "high";
  return "moderate";
}

/**
 * Classify heat index severity from °C.
 */
function classifyHeatSeverity(heatIndexC: number): Severity {
  if (heatIndexC > THRESHOLDS.heat.high_max) return "severe";
  if (heatIndexC > THRESHOLDS.heat.moderate_max) return "high";
  return "moderate";
}

/**
 * Classify AQI severity from peak AQI value.
 */
function classifyAqiSeverity(aqi: number): Severity {
  if (aqi > THRESHOLDS.aqi.high_max) return "severe";
  if (aqi > THRESHOLDS.aqi.moderate_max) return "high";
  return "moderate";
}

/**
 * Classify platform outage severity from the lowest volume index in the window.
 */
function classifyPlatformSeverity(lowestIndex: number): Severity {
  if (lowestIndex < THRESHOLDS.platform.high_min) return "severe";
  if (lowestIndex < THRESHOLDS.platform.moderate_min) return "high";
  return "moderate";
}

/**
 * Group an array of readings by zone_id.
 */
function groupByZone<T extends { zone_id: string }>(
  readings: T[]
): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const r of readings) {
    if (!groups[r.zone_id]) groups[r.zone_id] = [];
    groups[r.zone_id].push(r);
  }
  return groups;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  EVALUATORS — One per trigger type, all pure functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 1. Evaluate a single hourly rainfall reading.
 *
 * @param reading — One hourly weather reading for a zone.
 * @returns TriggerEvalResult if rainfall exceeds 35 mm/hr, otherwise null.
 */
export function evaluateRainfallTrigger(
  reading: RainfallReading
): TriggerEvalResult | null {
  const mm = reading.rainfall_mm_per_hr;
  const threshold = THRESHOLDS.rainfall.trigger;

  if (mm <= threshold) return null;

  const severity = classifyRainfallSeverity(mm);

  return {
    triggered: true,
    zone_id: reading.zone_id,
    trigger_type: "heavy_rain",
    severity,
    raw_value: mm,
    threshold_applied: threshold,
    timestamp: reading.timestamp,
    details:
      `Rainfall ${mm} mm/hr in ${reading.city} exceeds ${threshold} mm/hr ` +
      `threshold (severity: ${severity}). ` +
      `6-hour cumulative: ${reading.cumulative_6hr_mm} mm.`,
  };
}

/**
 * 2. Evaluate a single hourly heat reading.
 *
 * Computes the NOAA heat index from temperature + humidity, then checks
 * whether the result exceeds 42 °C during IST working hours (11 AM – 5 PM).
 *
 * @param reading — One hourly heat reading for a zone.
 * @returns TriggerEvalResult if heat index exceeds threshold during working hours, otherwise null.
 */
export function evaluateHeatTrigger(
  reading: HeatReading
): TriggerEvalResult | null {
  const istHour = getISTHour(reading.timestamp);
  const { working_hours_start, working_hours_end, trigger } = THRESHOLDS.heat;

  // Only evaluate during IST working hours (11:00–17:00)
  if (istHour < working_hours_start || istHour >= working_hours_end) {
    return null;
  }

  const heatIndex = computeHeatIndex(reading.temperature_c, reading.humidity_pct);

  if (heatIndex <= trigger) return null;

  const severity = classifyHeatSeverity(heatIndex);

  return {
    triggered: true,
    zone_id: reading.zone_id,
    trigger_type: "extreme_heat",
    severity,
    raw_value: Math.round(heatIndex * 10) / 10,
    threshold_applied: trigger,
    timestamp: reading.timestamp,
    details:
      `Heat index ${heatIndex.toFixed(1)}°C in ${reading.city} exceeds ` +
      `${trigger}°C threshold (severity: ${severity}). ` +
      `Ambient: ${reading.temperature_c}°C, Humidity: ${reading.humidity_pct}%.`,
  };
}

/**
 * 3. Evaluate AQI readings for a single zone across all hours.
 *
 * Scans for windows where AQI exceeds 300 for 2+ consecutive hours.
 * Returns one trigger result per sustained window found, or an empty array.
 *
 * @param readings — All hourly AQI readings for ONE zone, sorted by timestamp.
 * @returns Array of TriggerEvalResults for each sustained hazardous window.
 */
export function evaluateAQITrigger(
  readings: AqiReading[]
): TriggerEvalResult[] {
  const results: TriggerEvalResult[] = [];
  const threshold = THRESHOLDS.aqi.trigger;
  const minHours = THRESHOLDS.aqi.sustained_hours;

  // Sort by timestamp to ensure correct order
  const sorted = [...readings].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  let windowStart = -1;
  let peakAqi = 0;

  for (let i = 0; i <= sorted.length; i++) {
    const reading = sorted[i];
    const isAbove = reading !== undefined && reading.aqi > threshold;

    if (isAbove) {
      if (windowStart === -1) windowStart = i;
      if (reading.aqi > peakAqi) peakAqi = reading.aqi;
    }

    // Window ended (or we reached the end)
    if (!isAbove && windowStart !== -1) {
      const windowLength = i - windowStart;

      if (windowLength >= minHours) {
        const startReading = sorted[windowStart];
        const severity = classifyAqiSeverity(peakAqi);

        results.push({
          triggered: true,
          zone_id: startReading.zone_id,
          trigger_type: "hazardous_aqi",
          severity,
          raw_value: peakAqi,
          threshold_applied: threshold,
          timestamp: startReading.timestamp,
          details:
            `AQI sustained above ${threshold} for ${windowLength} consecutive ` +
            `hours in ${startReading.city} (peak: ${peakAqi}, ` +
            `pollutant: ${startReading.dominant_pollutant}). ` +
            `Severity: ${severity}.`,
        });
      }

      // Reset window
      windowStart = -1;
      peakAqi = 0;
    }
  }

  return results;
}

/**
 * 4. Evaluate a zone for closure / restriction.
 *
 * Returns a trigger if the `zone_closure` flag is truthy.
 * Always returns severity "severe" since zone closures represent
 * complete disruption to delivery operations.
 *
 * @param zone — Zone entry (from zones.json) with optional zone_closure flag.
 * @returns TriggerEvalResult if zone is closed, otherwise null.
 */
export function evaluateZoneTrigger(
  zone: ZoneClosureEntry
): TriggerEvalResult | null {
  if (!zone.zone_closure) return null;

  return {
    triggered: true,
    zone_id: zone.zone_id,
    trigger_type: "zone_closure",
    severity: "severe",
    raw_value: 1, // boolean — 1 means closed
    threshold_applied: 1,
    timestamp: new Date().toISOString(),
    details:
      `Zone ${zone.zone_id} in ${zone.city} is closed` +
      (zone.reason ? ` (reason: ${zone.reason})` : "") +
      `. All delivery operations suspended. Severity: severe.`,
  };
}

/**
 * 5. Evaluate platform readings for a single zone across all hours.
 *
 * Scans for windows where the order volume index is below 20 for 3+
 * consecutive hours. Severity is based on the lowest index in the window.
 *
 * @param readings — All hourly platform readings for ONE zone, sorted by timestamp.
 * @returns Array of TriggerEvalResults for each sustained disruption window.
 */
export function evaluatePlatformTrigger(
  readings: PlatformReading[]
): TriggerEvalResult[] {
  const results: TriggerEvalResult[] = [];
  const threshold = THRESHOLDS.platform.trigger;
  const minHours = THRESHOLDS.platform.sustained_hours;

  const sorted = [...readings].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  let windowStart = -1;
  let lowestIndex = Infinity;

  for (let i = 0; i <= sorted.length; i++) {
    const reading = sorted[i];
    const isBelow = reading !== undefined && reading.order_volume_index < threshold;

    if (isBelow) {
      if (windowStart === -1) windowStart = i;
      if (reading.order_volume_index < lowestIndex) {
        lowestIndex = reading.order_volume_index;
      }
    }

    // Window ended (or we reached the end)
    if (!isBelow && windowStart !== -1) {
      const windowLength = i - windowStart;

      if (windowLength >= minHours) {
        const startReading = sorted[windowStart];
        const severity = classifyPlatformSeverity(lowestIndex);

        results.push({
          triggered: true,
          zone_id: startReading.zone_id,
          trigger_type: "platform_outage",
          severity,
          raw_value: lowestIndex,
          threshold_applied: threshold,
          timestamp: startReading.timestamp,
          details:
            `Platform order volume below ${threshold} for ${windowLength} ` +
            `consecutive hours in ${startReading.city} ` +
            `(${startReading.platform}). Lowest index: ${lowestIndex}. ` +
            `Severity: ${severity}.`,
        });
      }

      // Reset window
      windowStart = -1;
      lowestIndex = Infinity;
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MASTER EVALUATOR — Runs all 5 evaluators across all zones
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 6. Evaluate all five trigger types across all zones in one pass.
 *
 * @param allFeedData — All five mock feed payloads.
 * @returns Array of every triggered event found, each with:
 *          zone_id, trigger_type, severity, raw_value, threshold_applied, timestamp.
 */
export function evaluateAllTriggers(
  allFeedData: AllFeedData
): TriggerEvalResult[] {
  const results: TriggerEvalResult[] = [];

  // ── 1. Rainfall — evaluate each reading individually ────────────────────
  for (const reading of allFeedData.weather.readings) {
    const result = evaluateRainfallTrigger(reading);
    if (result) results.push(result);
  }

  // ── 2. Heat — evaluate each reading individually ────────────────────────
  for (const reading of allFeedData.heat.readings) {
    const result = evaluateHeatTrigger(reading);
    if (result) results.push(result);
  }

  // ── 3. AQI — evaluate per zone (needs consecutive-hour window) ──────────
  const aqiByZone = groupByZone(allFeedData.aqi.readings);
  for (const zoneReadings of Object.values(aqiByZone)) {
    const zoneResults = evaluateAQITrigger(zoneReadings);
    results.push(...zoneResults);
  }

  // ── 4. Zone closures — evaluate each zone entry ─────────────────────────
  for (const zone of allFeedData.zones.zones) {
    const result = evaluateZoneTrigger(zone);
    if (result) results.push(result);
  }

  // ── 5. Platform — evaluate per zone (needs consecutive-hour window) ─────
  const platformByZone = groupByZone(allFeedData.platform.readings);
  for (const zoneReadings of Object.values(platformByZone)) {
    const zoneResults = evaluatePlatformTrigger(zoneReadings);
    results.push(...zoneResults);
  }

  return results;
}
