/**
 * Firebase Admin SDK — server-side only.
 *
 * This file must NEVER be imported from client components or browser code.
 * It uses the FIREBASE_ADMIN_* env vars (without NEXT_PUBLIC_ prefix)
 * so they are never bundled into client JS.
 *
 * Exports:  adminApp, adminAuth, adminDb, adminStorage
 */

import admin from "firebase-admin";
import type { ServiceAccount } from "firebase-admin";
import type { App } from "firebase-admin/app";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import type { Storage } from "firebase-admin/storage";

// ── Guard: prevent accidental client-side import ───────────────────────────────
if (typeof window !== "undefined") {
  throw new Error(
    "firebase-admin.ts must only be used on the server. " +
      "Do not import this file from client components."
  );
}

// ── Service-account credentials from env vars ──────────────────────────────────
const serviceAccount: ServiceAccount = {
  projectId: process.env.FIREBASE_ADMIN_PROJECT_ID!,
  clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
  // The private key is stored as a single-line string with literal "\n".
  // We replace them with real newlines so the PEM is valid.
  privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
};

// ── Singleton initialisation ───────────────────────────────────────────────────
const adminApp: App =
  admin.apps.length === 0
    ? admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
    : admin.apps[0]!;

const adminAuth: Auth = admin.auth(adminApp);
const adminDb: Firestore = admin.firestore(adminApp);
const adminStorage: Storage = admin.storage(adminApp);

export { adminApp, adminAuth, adminDb, adminStorage };
