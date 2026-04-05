/**
 * Firestore Client SDK — typed CRUD helpers for every collection.
 *
 * Uses the browser Firestore SDK so these helpers can be called from
 * client components, hooks, and (optionally) server actions.
 *
 * All functions are thin wrappers around the Firestore SDK with
 * proper TypeScript generics and automatic timestamp handling.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  serverTimestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
  type SnapshotOptions,
  type WithFieldValue,
  type UpdateData,
} from "firebase/firestore";
import { db } from "./firebase";

import type { WorkerProfile } from "@/types/worker";
import type { Policy, WeeklyCoverage } from "@/types/policy";
import type { Claim } from "@/types/claim";
import type { Payout } from "@/types/payout";
import type { TriggerEvent } from "@/types/trigger";
import type { RiskScore } from "@/types/risk";
import type { FraudSignal } from "@/types/fraud";
import type { Zone } from "@/types/zone";
import type { PlatformActivityFeed } from "@/types/platform";

// ─── Collection Names ─────────────────────────────────────────────────────────

export const COLLECTIONS = {
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

// ─── Firestore Converter (generic) ───────────────────────────────────────────

/**
 * Creates a typed Firestore converter that maps documents to/from
 * their TypeScript interface. The `id` field is pulled from the
 * document snapshot rather than stored as a field.
 */
function createConverter<T extends { id: string }>() {
  return {
    toFirestore(data: WithFieldValue<T>): DocumentData {
      // Strip `id` — Firestore uses the doc path, not a field
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, ...rest } = data as Record<string, unknown>;
      return rest;
    },
    fromFirestore(
      snapshot: QueryDocumentSnapshot,
      options?: SnapshotOptions
    ): T {
      const data = snapshot.data(options);
      return { ...data, id: snapshot.id } as T;
    },
  };
}

// ─── Generic Helpers ──────────────────────────────────────────────────────────

/**
 * Get a single document by ID from a typed collection.
 */
async function getDocument<T extends { id: string }>(
  collectionName: string,
  docId: string
): Promise<T | null> {
  const ref = doc(db, collectionName, docId).withConverter(
    createConverter<T>()
  );
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

/**
 * Query documents from a typed collection, returning all matches.
 */
async function queryDocuments<T extends { id: string }>(
  collectionName: string,
  ...queryConstraints: Parameters<typeof query>[1][]
): Promise<T[]> {
  const ref = collection(db, collectionName).withConverter(
    createConverter<T>()
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = query(ref, ...(queryConstraints as any));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

/**
 * Create a new document with auto-generated ID.
 * Automatically sets `createdAt` and `updatedAt` to server timestamp.
 */
async function createDocument<T extends { id: string }>(
  collectionName: string,
  data: Omit<T, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  const ref = collection(db, collectionName);
  const docRef = await addDoc(ref, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

/**
 * Update an existing document by ID.
 * Automatically refreshes `updatedAt` to server timestamp.
 */
async function updateDocument<T extends { id: string }>(
  collectionName: string,
  docId: string,
  data: Partial<Omit<T, "id" | "createdAt">>
): Promise<void> {
  const ref = doc(db, collectionName, docId);
  await updateDoc(ref, {
    ...data,
    updatedAt: serverTimestamp(),
  } as UpdateData<DocumentData>);
}

// ═══════════════════════════════════════════════════════════════════════════════
// WORKERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Get a worker profile by document ID. */
export async function getWorker(id: string): Promise<WorkerProfile | null> {
  return getDocument<WorkerProfile>(COLLECTIONS.workers, id);
}

/** Get a worker profile by Firebase Auth UID. */
export async function getWorkerByUid(
  uid: string
): Promise<WorkerProfile | null> {
  // Worker document IDs are the Firebase Auth UID.
  // Direct doc reads align with Firestore security rules better than list queries.
  return getDocument<WorkerProfile>(COLLECTIONS.workers, uid);
}

/** Create a new worker profile. Returns the new document ID. */
export async function createWorker(
  data: Omit<WorkerProfile, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  return createDocument<WorkerProfile>(COLLECTIONS.workers, data);
}

/** Update an existing worker profile. */
export async function updateWorker(
  id: string,
  data: Partial<Omit<WorkerProfile, "id" | "createdAt">>
): Promise<void> {
  return updateDocument<WorkerProfile>(COLLECTIONS.workers, id, data);
}

// ═══════════════════════════════════════════════════════════════════════════════
// POLICIES
// ═══════════════════════════════════════════════════════════════════════════════

/** Get a policy by document ID. */
export async function getPolicy(id: string): Promise<Policy | null> {
  return getDocument<Policy>(COLLECTIONS.policies, id);
}

/** Get all policies for a specific worker. */
export async function getPoliciesByWorker(
  workerId: string
): Promise<Policy[]> {
  return queryDocuments<Policy>(
    COLLECTIONS.policies,
    where("workerId", "==", workerId)
  );
}

/** Get the currently active policy for a worker (if any). */
export async function getActivePolicyByWorker(
  workerId: string
): Promise<Policy | null> {
  const results = await queryDocuments<Policy>(
    COLLECTIONS.policies,
    where("workerId", "==", workerId),
    where("status", "==", "active")
  );
  return results[0] ?? null;
}

/** Create a new policy. Returns the new document ID. */
export async function createPolicy(
  data: Omit<Policy, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  return createDocument<Policy>(COLLECTIONS.policies, data);
}

/** Update an existing policy. */
export async function updatePolicy(
  id: string,
  data: Partial<Omit<Policy, "id" | "createdAt">>
): Promise<void> {
  return updateDocument<Policy>(COLLECTIONS.policies, id, data);
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEEKLY COVERAGES
// ═══════════════════════════════════════════════════════════════════════════════

/** Get a weekly coverage by document ID. */
export async function getWeeklyCoverage(
  id: string
): Promise<WeeklyCoverage | null> {
  return getDocument<WeeklyCoverage>(COLLECTIONS.weeklyCoverages, id);
}

/** Get all coverages for a specific worker. */
export async function getCoveragesByWorker(
  workerId: string
): Promise<WeeklyCoverage[]> {
  return queryDocuments<WeeklyCoverage>(
    COLLECTIONS.weeklyCoverages,
    where("workerId", "==", workerId)
  );
}

/** Create a new weekly coverage. Returns the new document ID. */
export async function createWeeklyCoverage(
  data: Omit<WeeklyCoverage, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  return createDocument<WeeklyCoverage>(COLLECTIONS.weeklyCoverages, data);
}

/** Update an existing weekly coverage. */
export async function updateWeeklyCoverage(
  id: string,
  data: Partial<Omit<WeeklyCoverage, "id" | "createdAt">>
): Promise<void> {
  return updateDocument<WeeklyCoverage>(COLLECTIONS.weeklyCoverages, id, data);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLAIMS
// ═══════════════════════════════════════════════════════════════════════════════

/** Get a claim by document ID. */
export async function getClaim(id: string): Promise<Claim | null> {
  return getDocument<Claim>(COLLECTIONS.claims, id);
}

/** Get all claims for a specific worker. */
export async function getClaimsByWorker(workerId: string): Promise<Claim[]> {
  return queryDocuments<Claim>(
    COLLECTIONS.claims,
    where("workerId", "==", workerId)
  );
}

/** Get all claims (admin use). */
export async function getAllClaims(): Promise<Claim[]> {
  return queryDocuments<Claim>(COLLECTIONS.claims);
}

/** Create a new claim. Returns the new document ID. */
export async function createClaim(
  data: Omit<Claim, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  return createDocument<Claim>(COLLECTIONS.claims, data);
}

/** Update an existing claim. */
export async function updateClaim(
  id: string,
  data: Partial<Omit<Claim, "id" | "createdAt">>
): Promise<void> {
  return updateDocument<Claim>(COLLECTIONS.claims, id, data);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAYOUTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Get a payout by document ID. */
export async function getPayout(id: string): Promise<Payout | null> {
  return getDocument<Payout>(COLLECTIONS.payouts, id);
}

/** Get all payouts for a specific worker. */
export async function getPayoutsByWorker(
  workerId: string
): Promise<Payout[]> {
  return queryDocuments<Payout>(
    COLLECTIONS.payouts,
    where("workerId", "==", workerId)
  );
}

/** Create a new payout. Returns the new document ID. */
export async function createPayout(
  data: Omit<Payout, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  return createDocument<Payout>(COLLECTIONS.payouts, data);
}

/** Update an existing payout. */
export async function updatePayout(
  id: string,
  data: Partial<Omit<Payout, "id" | "createdAt">>
): Promise<void> {
  return updateDocument<Payout>(COLLECTIONS.payouts, id, data);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRIGGER EVENTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Get a trigger event by document ID. */
export async function getTriggerEvent(
  id: string
): Promise<TriggerEvent | null> {
  return getDocument<TriggerEvent>(COLLECTIONS.triggerEvents, id);
}

/** Get the most recent trigger events, ordered by creation time. */
export async function getRecentTriggerEvents(
  count: number = 20
): Promise<TriggerEvent[]> {
  return queryDocuments<TriggerEvent>(
    COLLECTIONS.triggerEvents,
    orderBy("createdAt", "desc"),
    firestoreLimit(count)
  );
}

/** Create a new trigger event. Returns the new document ID. */
export async function createTriggerEvent(
  data: Omit<TriggerEvent, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  return createDocument<TriggerEvent>(COLLECTIONS.triggerEvents, data);
}

// ═══════════════════════════════════════════════════════════════════════════════
// RISK SCORES
// ═══════════════════════════════════════════════════════════════════════════════

/** Get a risk score by document ID. */
export async function getRiskScore(id: string): Promise<RiskScore | null> {
  return getDocument<RiskScore>(COLLECTIONS.riskScores, id);
}

/** Get all risk scores for a specific worker. */
export async function getRiskScoresByWorker(
  workerId: string
): Promise<RiskScore[]> {
  return queryDocuments<RiskScore>(
    COLLECTIONS.riskScores,
    where("workerId", "==", workerId)
  );
}

/** Create a new risk score. Returns the new document ID. */
export async function createRiskScore(
  data: Omit<RiskScore, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  return createDocument<RiskScore>(COLLECTIONS.riskScores, data);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FRAUD SIGNALS
// ═══════════════════════════════════════════════════════════════════════════════

/** Get a fraud signal by document ID. */
export async function getFraudSignal(
  id: string
): Promise<FraudSignal | null> {
  return getDocument<FraudSignal>(COLLECTIONS.fraudSignals, id);
}

/** Get all fraud signals (admin only). */
export async function getAllFraudSignals(): Promise<FraudSignal[]> {
  return queryDocuments<FraudSignal>(COLLECTIONS.fraudSignals);
}

/** Create a new fraud signal. Returns the new document ID. */
export async function createFraudSignal(
  data: Omit<FraudSignal, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  return createDocument<FraudSignal>(COLLECTIONS.fraudSignals, data);
}

/** Update an existing fraud signal. */
export async function updateFraudSignal(
  id: string,
  data: Partial<Omit<FraudSignal, "id" | "createdAt">>
): Promise<void> {
  return updateDocument<FraudSignal>(COLLECTIONS.fraudSignals, id, data);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ZONES
// ═══════════════════════════════════════════════════════════════════════════════

/** Get a zone by document ID. */
export async function getZone(id: string): Promise<Zone | null> {
  return getDocument<Zone>(COLLECTIONS.zones, id);
}

/** Get all zones. */
export async function getAllZones(): Promise<Zone[]> {
  return queryDocuments<Zone>(COLLECTIONS.zones);
}

/** Create a new zone. Returns the new document ID. */
export async function createZone(
  data: Omit<Zone, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  return createDocument<Zone>(COLLECTIONS.zones, data);
}

/** Update an existing zone. */
export async function updateZone(
  id: string,
  data: Partial<Omit<Zone, "id" | "createdAt">>
): Promise<void> {
  return updateDocument<Zone>(COLLECTIONS.zones, id, data);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLATFORM ACTIVITY FEEDS
// ═══════════════════════════════════════════════════════════════════════════════

/** Get a platform activity feed entry by document ID. */
export async function getPlatformActivityFeed(
  id: string
): Promise<PlatformActivityFeed | null> {
  return getDocument<PlatformActivityFeed>(
    COLLECTIONS.platformActivityFeeds,
    id
  );
}

/** Get all activity feed entries for a specific zone. */
export async function getActivityFeedsByZone(
  zone: string
): Promise<PlatformActivityFeed[]> {
  return queryDocuments<PlatformActivityFeed>(
    COLLECTIONS.platformActivityFeeds,
    where("zone", "==", zone),
    orderBy("hour", "desc")
  );
}

/** Create a new platform activity feed entry. Returns the new document ID. */
export async function createPlatformActivityFeed(
  data: Omit<PlatformActivityFeed, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  return createDocument<PlatformActivityFeed>(
    COLLECTIONS.platformActivityFeeds,
    data
  );
}
