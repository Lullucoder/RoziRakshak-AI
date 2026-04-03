/**
 * scripts/seed.ts — Seed Firestore with realistic mock data.
 *
 * Uses the Firebase Admin SDK to bypass security rules.
 * Run with:  npm run seed
 *
 * Prerequisites:
 *   - FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL,
 *     FIREBASE_ADMIN_PRIVATE_KEY must be set in .env.local
 *
 * Flags:
 *   --clean   Delete all existing documents before seeding.
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load .env.local from project root
config({ path: resolve(__dirname, "..", ".env.local") });

import {
  initializeApp,
  cert,
  type ServiceAccount,
} from "firebase-admin/app";
import {
  getFirestore,
  FieldValue,
  type Firestore,
} from "firebase-admin/firestore";

// ── Initialise Admin SDK ──────────────────────────────────────────────────────

const serviceAccount: ServiceAccount = {
  projectId: process.env.FIREBASE_ADMIN_PROJECT_ID!,
  clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
  privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
};

const app = initializeApp({ credential: cert(serviceAccount) });
const db: Firestore = getFirestore(app);

// ── Collection Names ──────────────────────────────────────────────────────────

const COLLECTIONS = {
  workers: "workers",
  policies: "policies",
  weeklyCoverages: "weeklyCoverages",
  claims: "claims",
  payouts: "payouts",
  triggerEvents: "triggerEvents",
  riskScores: "riskScores",
  fraudSignals: "fraudSignals",
  zones: "zones",
  platformActivityFeeds: "platformActivityFeeds",
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

const now = FieldValue.serverTimestamp();

/** Writes a document with a deterministic ID and auto-timestamps. */
async function seed(
  collectionName: string,
  docId: string,
  data: Record<string, unknown>
) {
  await db
    .collection(collectionName)
    .doc(docId)
    .set({ ...data, createdAt: now, updatedAt: now });
  console.log(`  ✓ ${collectionName}/${docId}`);
}

/** Deletes every document in a collection. */
async function clearCollection(collectionName: string) {
  const snap = await db.collection(collectionName).get();
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  console.log(`  🗑  Cleared ${collectionName} (${snap.size} docs)`);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SEED DATA
// ═══════════════════════════════════════════════════════════════════════════════

async function seedWorkers() {
  console.log("\n📋 Seeding workers…");

  await seed(COLLECTIONS.workers, "worker-001", {
    uid: "worker-001",
    phone: "+919876543210",
    name: "Arjun K.",
    city: "Bengaluru",
    platform: "Zepto",
    zone: "Koramangala",
    workingHours: "morning",
    weeklyEarningRange: "₹6,000–₹8,000",
    upiId: "arjun@upi",
    role: "worker",
    isOnboarded: true,
    trustScore: 0.91,
    activePlan: "core",
    claimsCount: 3,
    joinedDate: "2026-01-15T00:00:00.000Z",
  });

  await seed(COLLECTIONS.workers, "worker-002", {
    uid: "worker-002",
    phone: "+919123456789",
    name: "Priya S.",
    city: "Bengaluru",
    platform: "Blinkit",
    zone: "HSR Layout",
    workingHours: "afternoon",
    weeklyEarningRange: "₹5,000–₹7,000",
    upiId: "priya@upi",
    role: "worker",
    isOnboarded: true,
    trustScore: 0.78,
    activePlan: "lite",
    claimsCount: 1,
    joinedDate: "2026-02-01T00:00:00.000Z",
  });

  await seed(COLLECTIONS.workers, "worker-003", {
    uid: "worker-003",
    phone: "+919555123456",
    name: "Ravi M.",
    city: "Delhi",
    platform: "Swiggy Instamart",
    zone: "Anand Vihar",
    workingHours: "evening",
    weeklyEarningRange: "₹7,000–₹9,000",
    upiId: "ravi@upi",
    role: "worker",
    isOnboarded: true,
    trustScore: 0.65,
    activePlan: "peak",
    claimsCount: 5,
    joinedDate: "2025-12-10T00:00:00.000Z",
  });

  await seed(COLLECTIONS.workers, "worker-004", {
    uid: "worker-004",
    phone: "+919988776655",
    name: "Meena D.",
    city: "Delhi",
    platform: "Zepto",
    zone: "Connaught Place",
    workingHours: "full_day",
    weeklyEarningRange: "₹8,000–₹10,000",
    upiId: "meena@upi",
    role: "worker",
    isOnboarded: true,
    trustScore: 0.85,
    activePlan: "core",
    claimsCount: 2,
    joinedDate: "2026-01-20T00:00:00.000Z",
  });

  await seed(COLLECTIONS.workers, "admin-001", {
    uid: "admin-001",
    phone: "+910000000000",
    name: "Admin User",
    city: "Bengaluru",
    platform: "Internal",
    zone: "All",
    workingHours: "full_day",
    weeklyEarningRange: "N/A",
    upiId: "",
    role: "admin",
    isOnboarded: true,
    trustScore: 1.0,
    activePlan: null,
    claimsCount: 0,
    joinedDate: "2026-01-01T00:00:00.000Z",
  });
}

async function seedZones() {
  console.log("\n🗺️  Seeding zones…");

  await seed(COLLECTIONS.zones, "zone-koramangala", {
    name: "Koramangala",
    city: "Bengaluru",
    geojson: null,
    riskScore: 0.42,
    triggerDensity: 34,
    activeWorkers: 128,
    topTriggerType: "heavy_rain",
    isActive: true,
  });

  await seed(COLLECTIONS.zones, "zone-hsr", {
    name: "HSR Layout",
    city: "Bengaluru",
    geojson: null,
    riskScore: 0.31,
    triggerDensity: 22,
    activeWorkers: 95,
    topTriggerType: "extreme_heat",
    isActive: true,
  });

  await seed(COLLECTIONS.zones, "zone-anandvihar", {
    name: "Anand Vihar",
    city: "Delhi",
    geojson: null,
    riskScore: 0.67,
    triggerDensity: 58,
    activeWorkers: 210,
    topTriggerType: "hazardous_aqi",
    isActive: true,
  });

  await seed(COLLECTIONS.zones, "zone-cp", {
    name: "Connaught Place",
    city: "Delhi",
    geojson: null,
    riskScore: 0.25,
    triggerDensity: 15,
    activeWorkers: 75,
    topTriggerType: "platform_outage",
    isActive: true,
  });
}

async function seedPolicies() {
  console.log("\n📄 Seeding policies…");

  const weekStart = "2026-03-31T00:00:00.000Z"; // Mon
  const weekEnd = "2026-04-06T23:59:59.000Z"; // Sun

  await seed(COLLECTIONS.policies, "policy-001", {
    workerId: "worker-001",
    plan: "core",
    premium: 79,
    maxProtection: 1500,
    weekStart,
    weekEnd,
    status: "active",
    triggers: ["heavy_rain", "extreme_heat", "platform_outage"],
  });

  await seed(COLLECTIONS.policies, "policy-002", {
    workerId: "worker-002",
    plan: "lite",
    premium: 49,
    maxProtection: 800,
    weekStart,
    weekEnd,
    status: "active",
    triggers: ["heavy_rain", "extreme_heat"],
  });

  await seed(COLLECTIONS.policies, "policy-003", {
    workerId: "worker-003",
    plan: "peak",
    premium: 129,
    maxProtection: 3000,
    weekStart,
    weekEnd,
    status: "active",
    triggers: [
      "heavy_rain",
      "extreme_heat",
      "hazardous_aqi",
      "zone_closure",
      "platform_outage",
    ],
  });

  await seed(COLLECTIONS.policies, "policy-004", {
    workerId: "worker-004",
    plan: "core",
    premium: 69,
    maxProtection: 1500,
    weekStart,
    weekEnd,
    status: "active",
    triggers: ["heavy_rain", "extreme_heat", "platform_outage"],
  });
}

async function seedWeeklyCoverages() {
  console.log("\n🛡️  Seeding weekly coverages…");

  const weekStart = "2026-03-31T00:00:00.000Z";
  const weekEnd = "2026-04-06T23:59:59.000Z";

  await seed(COLLECTIONS.weeklyCoverages, "coverage-001", {
    workerId: "worker-001",
    policyId: "policy-001",
    weekStart,
    weekEnd,
    premiumPaid: 79,
    maxProtection: 1500,
    status: "active",
    totalPaidOut: 350,
    claimIds: ["claim-001"],
  });

  await seed(COLLECTIONS.weeklyCoverages, "coverage-002", {
    workerId: "worker-002",
    policyId: "policy-002",
    weekStart,
    weekEnd,
    premiumPaid: 49,
    maxProtection: 800,
    status: "active",
    totalPaidOut: 0,
    claimIds: [],
  });

  await seed(COLLECTIONS.weeklyCoverages, "coverage-003", {
    workerId: "worker-003",
    policyId: "policy-003",
    weekStart,
    weekEnd,
    premiumPaid: 129,
    maxProtection: 3000,
    status: "claimed",
    totalPaidOut: 750,
    claimIds: ["claim-002", "claim-003"],
  });

  await seed(COLLECTIONS.weeklyCoverages, "coverage-004", {
    workerId: "worker-004",
    policyId: "policy-004",
    weekStart,
    weekEnd,
    premiumPaid: 69,
    maxProtection: 1500,
    status: "active",
    totalPaidOut: 0,
    claimIds: [],
  });
}

async function seedTriggerEvents() {
  console.log("\n⚡ Seeding trigger events…");

  await seed(COLLECTIONS.triggerEvents, "trigger-001", {
    type: "heavy_rain",
    severity: "severe",
    zone: "Koramangala",
    city: "Bengaluru",
    startTime: "2026-04-01T14:00:00.000Z",
    endTime: "2026-04-01T18:00:00.000Z",
    details:
      "Intense rainfall exceeding 65 mm/hr recorded in Koramangala. Roads waterlogged, delivery operations severely impacted.",
    affectedWorkers: 42,
    confidenceScore: 0.96,
    result: "auto_approved",
    source: "open-meteo",
    rawValue: 65.2,
    thresholdApplied: 30,
  });

  await seed(COLLECTIONS.triggerEvents, "trigger-002", {
    type: "extreme_heat",
    severity: "high",
    zone: "Anand Vihar",
    city: "Delhi",
    startTime: "2026-04-02T11:00:00.000Z",
    endTime: null,
    details:
      "Wet-bulb temperature reached 34°C in Anand Vihar. Heat advisory active, outdoor work discouraged.",
    affectedWorkers: 85,
    confidenceScore: 0.82,
    result: "auto_approved",
    source: "open-meteo",
    rawValue: 34.1,
    thresholdApplied: 32,
  });

  await seed(COLLECTIONS.triggerEvents, "trigger-003", {
    type: "platform_outage",
    severity: "moderate",
    zone: "HSR Layout",
    city: "Bengaluru",
    startTime: "2026-04-02T09:30:00.000Z",
    endTime: "2026-04-02T10:45:00.000Z",
    details:
      "Blinkit order volume dropped to 8% of hourly average in HSR Layout. Possible backend outage.",
    affectedWorkers: 31,
    confidenceScore: 0.55,
    result: "under_review",
    source: "mock-platform-ops",
    rawValue: 8,
    thresholdApplied: 20,
  });
}

async function seedClaims() {
  console.log("\n📝 Seeding claims…");

  await seed(COLLECTIONS.claims, "claim-001", {
    workerId: "worker-001",
    workerName: "Arjun K.",
    policyId: "policy-001",
    triggerEventId: "trigger-001",
    triggerType: "heavy_rain",
    triggerSeverity: "severe",
    status: "auto_approved",
    confidenceScore: 0.96,
    payoutAmount: 350,
    payoutId: "payout-001",
    zone: "Koramangala",
    description:
      "Severe rainfall event in Koramangala. Arjun's delivery shift was impacted for 4 hours. Auto-approved based on weather data confidence ≥ 0.75.",
    resolvedAt: "2026-04-01T18:15:00.000Z",
  });

  await seed(COLLECTIONS.claims, "claim-002", {
    workerId: "worker-003",
    workerName: "Ravi M.",
    policyId: "policy-003",
    triggerEventId: "trigger-002",
    triggerType: "extreme_heat",
    triggerSeverity: "high",
    status: "under_review",
    confidenceScore: 0.62,
    payoutAmount: 0,
    payoutId: null,
    zone: "Anand Vihar",
    description:
      "Extreme heat event in Anand Vihar. Ravi reported inability to continue deliveries due to heat advisory. Confidence in soft-review range — awaiting 2-hour auto-approval window.",
    resolvedAt: null,
  });

  await seed(COLLECTIONS.claims, "claim-003", {
    workerId: "worker-003",
    workerName: "Ravi M.",
    policyId: "policy-003",
    triggerEventId: "trigger-003",
    triggerType: "platform_outage",
    triggerSeverity: "moderate",
    status: "held",
    confidenceScore: 0.35,
    payoutAmount: 0,
    payoutId: null,
    zone: "HSR Layout",
    description:
      "Blinkit platform outage affected Ravi's orders. Low confidence score — held for manual investigation by the claims team.",
    resolvedAt: null,
  });
}

async function seedPayouts() {
  console.log("\n💰 Seeding payouts…");

  await seed(COLLECTIONS.payouts, "payout-001", {
    claimId: "claim-001",
    workerId: "worker-001",
    policyId: "policy-001",
    amount: 350,
    method: "upi",
    upiId: "arjun@upi",
    status: "completed",
    razorpayPayoutId: "pout_test_Abc123xyz",
    razorpayStatus: "processed",
    failureReason: null,
    paidAt: "2026-04-01T18:30:00.000Z",
  });

  await seed(COLLECTIONS.payouts, "payout-002", {
    claimId: "claim-002",
    workerId: "worker-003",
    policyId: "policy-003",
    amount: 400,
    method: "upi",
    upiId: "ravi@upi",
    status: "pending",
    razorpayPayoutId: null,
    razorpayStatus: null,
    failureReason: null,
    paidAt: null,
  });
}

async function seedRiskScores() {
  console.log("\n📊 Seeding risk scores…");

  await seed(COLLECTIONS.riskScores, "risk-001", {
    workerId: "worker-001",
    zoneId: "zone-koramangala",
    weekOf: "2026-03-31T00:00:00.000Z",
    riskTier: "medium",
    disruptionProbability: 0.42,
    premiumSuggestion: 79,
    factors: [
      {
        factor: "zone_flood_history",
        weight: 0.45,
        description: "Koramangala has a history of waterlogging during March–April monsoon pre-season.",
      },
      {
        factor: "shift_exposure",
        weight: 0.3,
        description: "Morning shifts overlap with peak rainfall probability window (6–11 AM).",
      },
    ],
    modelVersion: "xgb-v2.1-proto",
  });

  await seed(COLLECTIONS.riskScores, "risk-002", {
    workerId: "worker-002",
    zoneId: "zone-hsr",
    weekOf: "2026-03-31T00:00:00.000Z",
    riskTier: "low",
    disruptionProbability: 0.18,
    premiumSuggestion: 49,
    factors: [
      {
        factor: "platform_reliability",
        weight: 0.4,
        description: "Blinkit HSR Layout hub has had 99.2% uptime over the past 30 days.",
      },
    ],
    modelVersion: "xgb-v2.1-proto",
  });

  await seed(COLLECTIONS.riskScores, "risk-003", {
    workerId: "worker-003",
    zoneId: "zone-anandvihar",
    weekOf: "2026-03-31T00:00:00.000Z",
    riskTier: "high",
    disruptionProbability: 0.71,
    premiumSuggestion: 129,
    factors: [
      {
        factor: "aqi_forecast",
        weight: 0.5,
        description: "Delhi AQI forecast predicts 350+ (Very Poor) for 4 out of 7 days this week.",
      },
      {
        factor: "heat_wave_risk",
        weight: 0.35,
        description:
          "IMD has issued an orange alert for extreme heat in East Delhi through mid-April.",
      },
    ],
    modelVersion: "xgb-v2.1-proto",
  });

  await seed(COLLECTIONS.riskScores, "risk-004", {
    workerId: "worker-004",
    zoneId: "zone-cp",
    weekOf: "2026-03-31T00:00:00.000Z",
    riskTier: "low",
    disruptionProbability: 0.15,
    premiumSuggestion: 69,
    factors: [
      {
        factor: "zone_stability",
        weight: 0.6,
        description:
          "Connaught Place zone has low historical disruption frequency and good infrastructure.",
      },
    ],
    modelVersion: "xgb-v2.1-proto",
  });
}

async function seedFraudSignals() {
  console.log("\n🚨 Seeding fraud signals…");

  await seed(COLLECTIONS.fraudSignals, "fraud-001", {
    workerId: "worker-003",
    workerName: "Ravi M.",
    claimId: "claim-003",
    signalType: "GPS-WiFi Mismatch",
    severity: "medium",
    details:
      "Ravi's GPS coordinates placed him in Noida Sector 62 while his WiFi BSSID resolved to an Anand Vihar residential network. Distance discrepancy: 14.3 km. This may indicate location spoofing or a stale WiFi cache.",
    status: "open",
  });
}

async function seedPlatformActivityFeeds() {
  console.log("\n📡 Seeding platform activity feeds…");

  await seed(COLLECTIONS.platformActivityFeeds, "feed-001", {
    city: "Bengaluru",
    zone: "Koramangala",
    hour: "2026-04-01T14:00:00.000Z",
    orderVolumeIndex: 22,
    isDisrupted: true,
    feedSource: "mock-platform-ops",
    rawPayload: {
      ordersReceived: 14,
      expectedOrders: 64,
      driverOnline: 18,
      note: "Volume collapse correlates with heavy rainfall event trigger-001.",
    },
  });

  await seed(COLLECTIONS.platformActivityFeeds, "feed-002", {
    city: "Bengaluru",
    zone: "Koramangala",
    hour: "2026-04-01T15:00:00.000Z",
    orderVolumeIndex: 35,
    isDisrupted: true,
    feedSource: "mock-platform-ops",
    rawPayload: {
      ordersReceived: 22,
      expectedOrders: 64,
      driverOnline: 25,
      note: "Slight recovery, rain intensity decreasing.",
    },
  });

  await seed(COLLECTIONS.platformActivityFeeds, "feed-003", {
    city: "Bengaluru",
    zone: "Koramangala",
    hour: "2026-04-01T16:00:00.000Z",
    orderVolumeIndex: 78,
    isDisrupted: false,
    feedSource: "mock-platform-ops",
    rawPayload: {
      ordersReceived: 50,
      expectedOrders: 64,
      driverOnline: 48,
      note: "Near-normal operations resumed.",
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  const shouldClean = process.argv.includes("--clean");

  console.log("🌱 RoziRakshak AI — Firestore Seed Script");
  console.log(`   Project: ${serviceAccount.projectId}`);
  console.log(`   Clean mode: ${shouldClean ? "YES" : "no"}`);

  if (shouldClean) {
    console.log("\n🗑  Cleaning existing data…");
    for (const col of Object.values(COLLECTIONS)) {
      await clearCollection(col);
    }
  }

  await seedWorkers();
  await seedZones();
  await seedPolicies();
  await seedWeeklyCoverages();
  await seedTriggerEvents();
  await seedClaims();
  await seedPayouts();
  await seedRiskScores();
  await seedFraudSignals();
  await seedPlatformActivityFeeds();

  console.log("\n✅ Seeding complete! All collections populated.");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Seed failed:", err);
  process.exit(1);
});
