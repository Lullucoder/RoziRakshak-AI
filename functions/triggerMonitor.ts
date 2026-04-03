/**
 * functions/triggerMonitor.ts — Cloud Function: Trigger Monitoring Engine.
 *
 * Runs on a schedule (every hour) or can be HTTP-triggered from the admin UI.
 * This is the ONLY file that performs Firestore writes for the trigger system.
 *
 * Flow:
 *   1. Fetch 5 mock JSON feeds from the deployed Next.js app
 *   2. Pass feed data to evaluateAllTriggers() (pure logic in lib/triggers.ts)
 *   3. For each triggered event:
 *      a. Write a triggerEvent document to Firestore
 *      b. Query active policies whose worker's zone matches the triggered zone
 *      c. Create a claim document for each matching policy
 *   4. Log a summary
 *
 * Run with: npx tsx functions/triggerMonitor.ts
 * Deploy as: Firebase Cloud Function (scheduled, every hour)
 */

import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";

// Load .env.local from project root (for local execution)
config({ path: resolve(__dirname, "..", ".env.local") });

import {
  initializeApp,
  getApps,
  cert,
  type ServiceAccount,
} from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

import {
  evaluateAllTriggers,
  type AllFeedData,
  type TriggerEvalResult,
} from "../src/lib/triggers";

// ═══════════════════════════════════════════════════════════════════════════════
//  FIREBASE ADMIN — Singleton init
// ═══════════════════════════════════════════════════════════════════════════════

const serviceAccount: ServiceAccount = {
  projectId: process.env.FIREBASE_ADMIN_PROJECT_ID!,
  clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
  privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
};

const app =
  getApps().length === 0
    ? initializeApp({ credential: cert(serviceAccount) })
    : getApps()[0];

const db = getFirestore(app);

// ═══════════════════════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const COLLECTIONS = {
  triggerEvents: "triggerEvents",
  claims: "claims",
  policies: "policies",
  workers: "workers",
} as const;

/**
 * Base URL for the deployed Next.js app (serves /mocks/* static files).
 * Falls back to reading local files directly for local dev / testing.
 */
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "";

const FEED_FILES = [
  "weather.json",
  "aqi.json",
  "heat.json",
  "platform.json",
  "zones.json",
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
//  FEED FETCHING — Remote (deployed) or local (dev)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch a single mock JSON feed.
 * - If APP_BASE_URL is set, fetches from the deployed Next.js /mocks/ route.
 * - Otherwise, reads directly from the local public/mocks/ directory.
 */
async function fetchFeed<T>(filename: string): Promise<T> {
  if (APP_BASE_URL) {
    const url = `${APP_BASE_URL}/mocks/${filename}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  }

  // Local fallback: read from filesystem
  const filePath = resolve(__dirname, "..", "public", "mocks", filename);
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

/**
 * Fetch all 5 mock feeds and bundle them into the AllFeedData shape
 * expected by evaluateAllTriggers().
 */
async function fetchAllFeeds(): Promise<AllFeedData> {
  const [weather, aqi, heat, platform, zones] = await Promise.all([
    fetchFeed<AllFeedData["weather"]>("weather.json"),
    fetchFeed<AllFeedData["aqi"]>("aqi.json"),
    fetchFeed<AllFeedData["heat"]>("heat.json"),
    fetchFeed<AllFeedData["platform"]>("platform.json"),
    fetchFeed<AllFeedData["zones"]>("zones.json"),
  ]);

  return { weather, aqi, heat, platform, zones };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  FIRESTORE HELPERS — Admin SDK write operations
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Write a triggerEvent document to Firestore.
 * Returns the auto-generated document ID.
 */
async function writeTriggerEvent(
  trigger: TriggerEvalResult
): Promise<string> {
  const docRef = await db.collection(COLLECTIONS.triggerEvents).add({
    type: trigger.trigger_type,
    severity: trigger.severity,
    zone: trigger.zone_id,
    city: getCityForZone(trigger.zone_id),
    startTime: trigger.timestamp,
    endTime: null,
    details: trigger.details,
    affectedWorkers: 0, // Updated below after policy query
    confidenceScore: null,
    result: null,
    source: "mock_feed",
    rawValue: trigger.raw_value,
    thresholdApplied: trigger.threshold_applied,
    status: "confirmed",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return docRef.id;
}

/**
 * Create a claim document in Firestore.
 * Returns the auto-generated document ID.
 */
async function writeClaim(params: {
  workerId: string;
  workerName: string;
  policyId: string;
  triggerEventId: string;
  triggerType: string;
  triggerSeverity: string;
  zone: string;
  details: string;
}): Promise<string> {
  const docRef = await db.collection(COLLECTIONS.claims).add({
    workerId: params.workerId,
    workerName: params.workerName,
    policyId: params.policyId,
    triggerEventId: params.triggerEventId,
    triggerType: params.triggerType,
    triggerSeverity: params.triggerSeverity,
    status: "pending_fraud_check",
    confidenceScore: 0,
    payoutAmount: 0,
    payoutId: null,
    zone: params.zone,
    description: params.details,
    resolvedAt: null,
    autoInitiated: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return docRef.id;
}

/**
 * Query all active policies whose worker is in the given zone + city,
 * and whose triggers array includes the given trigger type.
 *
 * Since Policy doesn't store zone directly, we:
 *   1. Query workers by city (consistent across mock feeds and seed data)
 *   2. Get their active policies
 *   3. Filter policies that cover the trigger type
 */
async function findMatchingPolicies(
  zoneId: string,
  city: string,
  triggerType: string
): Promise<
  Array<{
    policyId: string;
    workerId: string;
    workerName: string;
    workerZone: string;
  }>
> {
  // Step 1: Find all workers in this city
  const workersSnap = await db
    .collection(COLLECTIONS.workers)
    .where("city", "==", city)
    .where("role", "==", "worker")
    .get();

  if (workersSnap.empty) return [];

  const results: Array<{
    policyId: string;
    workerId: string;
    workerName: string;
    workerZone: string;
  }> = [];

  // Step 2: For each worker, check if they have an active policy covering this trigger
  for (const workerDoc of workersSnap.docs) {
    const worker = workerDoc.data();
    const workerId = workerDoc.id;

    // Step 3: Query active policies for this worker
    const policiesSnap = await db
      .collection(COLLECTIONS.policies)
      .where("workerId", "==", workerId)
      .where("status", "==", "active")
      .get();

    for (const policyDoc of policiesSnap.docs) {
      const policy = policyDoc.data();

      // Step 4: Check if policy covers this trigger type
      if (
        Array.isArray(policy.triggers) &&
        policy.triggers.includes(triggerType)
      ) {
        results.push({
          policyId: policyDoc.id,
          workerId,
          workerName: worker.name || "Unknown Worker",
          workerZone: worker.zone || zoneId,
        });
      }
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ZONE → CITY MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

/** Cache of zone_id → city from zones.json, populated at runtime. */
let zoneCityMap: Record<string, string> = {};

function getCityForZone(zoneId: string): string {
  return zoneCityMap[zoneId] || "Unknown";
}

/**
 * Build the zone_id → city lookup from the zones feed data.
 */
function buildZoneCityMap(
  zones: AllFeedData["zones"]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const zone of zones.zones) {
    map[zone.zone_id] = zone.city;
  }
  return map;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN — The trigger monitoring engine
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Main entry point for the trigger monitor.
 *
 * This function is designed to be called by:
 *   - A scheduled Cloud Function (every hour)
 *   - An HTTP-triggered Cloud Function (admin "Run Trigger Scan" button)
 *   - Direct CLI invocation (npx tsx functions/triggerMonitor.ts)
 */
export async function runTriggerMonitor(): Promise<{
  zonesChecked: number;
  triggersFired: number;
  claimsCreated: number;
  errors: string[];
}> {
  const startTime = Date.now();
  console.log("═══════════════════════════════════════════════════════════");
  console.log("⚡ Trigger Monitor — Starting scan");
  console.log(`   Time: ${new Date().toISOString()}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  const summary = {
    zonesChecked: 0,
    triggersFired: 0,
    claimsCreated: 0,
    errors: [] as string[],
  };

  // ── Step 1: Fetch all feeds ──────────────────────────────────────────────
  let feedData: AllFeedData;
  try {
    console.log("📡 Fetching mock feeds…");
    feedData = await fetchAllFeeds();
    zoneCityMap = buildZoneCityMap(feedData.zones);
    summary.zonesChecked = feedData.zones.zones.length;
    console.log(`   ✓ Loaded ${FEED_FILES.length} feeds, ${summary.zonesChecked} zones\n`);
  } catch (err) {
    const msg = `Fatal: Failed to fetch feeds — ${err instanceof Error ? err.message : err}`;
    console.error(`   ✗ ${msg}`);
    summary.errors.push(msg);
    return summary;
  }

  // ── Step 2: Evaluate all triggers (pure logic, no side effects) ──────────
  let triggers: TriggerEvalResult[];
  try {
    console.log("🔍 Evaluating triggers…");
    triggers = evaluateAllTriggers(feedData);
    summary.triggersFired = triggers.length;
    console.log(`   ✓ Found ${triggers.length} triggered events\n`);
  } catch (err) {
    const msg = `Fatal: evaluateAllTriggers failed — ${err instanceof Error ? err.message : err}`;
    console.error(`   ✗ ${msg}`);
    summary.errors.push(msg);
    return summary;
  }

  if (triggers.length === 0) {
    console.log("✅ No triggers fired. All zones within safe thresholds.\n");
    return summary;
  }

  // ── Step 3: Process each trigger — write to Firestore + create claims ────
  console.log("📝 Processing triggered events…\n");

  for (const trigger of triggers) {
    try {
      const city = getCityForZone(trigger.zone_id);

      // 3a. Write trigger event to Firestore
      const triggerEventId = await writeTriggerEvent(trigger);
      console.log(
        `   ⚡ [${trigger.trigger_type}] ${trigger.zone_id} (${city}) ` +
          `severity=${trigger.severity} raw=${trigger.raw_value} → doc: ${triggerEventId}`
      );

      // 3b. Find matching active policies
      const matchingPolicies = await findMatchingPolicies(
        trigger.zone_id,
        city,
        trigger.trigger_type
      );

      if (matchingPolicies.length === 0) {
        console.log(`      └─ No active policies cover this zone+trigger\n`);
        continue;
      }

      // 3c. Update triggerEvent with affected worker count
      await db.collection(COLLECTIONS.triggerEvents).doc(triggerEventId).update({
        affectedWorkers: matchingPolicies.length,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // 3d. Create a claim for each matching policy
      for (const match of matchingPolicies) {
        try {
          const claimId = await writeClaim({
            workerId: match.workerId,
            workerName: match.workerName,
            policyId: match.policyId,
            triggerEventId,
            triggerType: trigger.trigger_type,
            triggerSeverity: trigger.severity,
            zone: match.workerZone,
            details:
              `Auto-initiated claim: ${trigger.details} ` +
              `Policy: ${match.policyId}`,
          });

          summary.claimsCreated++;
          console.log(
            `      ├─ Claim created: ${claimId} for worker ${match.workerName} ` +
              `(${match.workerId}) policy=${match.policyId}`
          );
        } catch (claimErr) {
          const msg =
            `Claim creation failed for worker ${match.workerId}: ` +
            `${claimErr instanceof Error ? claimErr.message : claimErr}`;
          console.error(`      ├─ ✗ ${msg}`);
          summary.errors.push(msg);
          // Continue — don't let one failed claim stop the rest
        }
      }

      console.log(
        `      └─ ${matchingPolicies.length} claim(s) created for this trigger\n`
      );
    } catch (triggerErr) {
      const msg =
        `Trigger processing failed [${trigger.trigger_type}] ` +
        `zone=${trigger.zone_id}: ` +
        `${triggerErr instanceof Error ? triggerErr.message : triggerErr}`;
      console.error(`   ✗ ${msg}\n`);
      summary.errors.push(msg);
      // Continue — don't let one failed zone crash the entire run
    }
  }

  // ── Step 4: Log summary ──────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("═══════════════════════════════════════════════════════════");
  console.log("📊 Trigger Monitor — Scan Complete");
  console.log(`   Zones checked:   ${summary.zonesChecked}`);
  console.log(`   Triggers fired:  ${summary.triggersFired}`);
  console.log(`   Claims created:  ${summary.claimsCreated}`);
  console.log(`   Errors:          ${summary.errors.length}`);
  console.log(`   Duration:        ${elapsed}s`);
  console.log("═══════════════════════════════════════════════════════════\n");

  if (summary.errors.length > 0) {
    console.log("⚠️  Errors encountered:");
    summary.errors.forEach((e, i) => console.log(`   ${i + 1}. ${e}`));
    console.log();
  }

  return summary;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CLI — Direct execution support
// ═══════════════════════════════════════════════════════════════════════════════

// If this file is run directly (npx tsx functions/triggerMonitor.ts),
// execute the monitor immediately.
const isDirectRun =
  require.main === module ||
  process.argv[1]?.includes("triggerMonitor");

if (isDirectRun) {
  runTriggerMonitor()
    .then((summary) => {
      if (summary.errors.length > 0) {
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error("💥 Unhandled error in trigger monitor:", err);
      process.exit(1);
    });
}
