import { Timestamp } from "firebase/firestore";

// ─── Firestore Helpers ────────────────────────────────────────────────────────

/**
 * Firestore-compatible timestamp type.
 * Accepts both native Firestore `Timestamp` objects (production) and
 * ISO-8601 strings (mock / seed data).
 */
export type FirestoreTimestamp = Timestamp | string;

/**
 * Base interface that every Firestore document must extend.
 *
 * - `id`        — Firestore document ID (auto-generated or deterministic).
 * - `createdAt` — Set once when the document is first written.
 * - `updatedAt` — Refreshed on every write via `serverTimestamp()`.
 */
export interface BaseDocument {
  id: string;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}
