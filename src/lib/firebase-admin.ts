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

// ── Lazy singleton initialisation ──────────────────────────────────────────────

const REQUIRED_ENV_KEYS = [
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
] as const;

const missingEnvKeys = REQUIRED_ENV_KEYS.filter((key) => !process.env[key]);
const isFirebaseAdminConfigured = missingEnvKeys.length === 0;

let cachedApp: App | null = null;
let cachedAuth: Auth | null = null;
let cachedDb: Firestore | null = null;
let cachedStorage: Storage | null = null;

function getServiceAccountFromEnv(): ServiceAccount {
  return {
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID!,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
    // The private key is stored as a single-line string with literal "\\n".
    // We replace them with real newlines so the PEM is valid.
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, "\n"),
  };
}

function ensureAdminApp(): App {
  if (cachedApp) {
    return cachedApp;
  }

  if (admin.apps.length > 0) {
    cachedApp = admin.apps[0]!;
    return cachedApp;
  }

  if (!isFirebaseAdminConfigured) {
    throw new Error(
      `Firebase Admin is not configured. Missing env vars: ${missingEnvKeys.join(", ")}`
    );
  }

  cachedApp = admin.initializeApp({
    credential: admin.credential.cert(getServiceAccountFromEnv()),
  });
  return cachedApp;
}

function createLazyServiceProxy<T extends object>(factory: () => T): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      const instance = factory() as Record<PropertyKey, unknown>;
      const value = instance[prop];
      if (typeof value === "function") {
        return value.bind(instance);
      }
      return value;
    },
  });
}

function ensureAdminAuth(): Auth {
  if (!cachedAuth) {
    cachedAuth = admin.auth(ensureAdminApp());
  }
  return cachedAuth;
}

function ensureAdminDb(): Firestore {
  if (!cachedDb) {
    cachedDb = admin.firestore(ensureAdminApp());
  }
  return cachedDb;
}

function ensureAdminStorage(): Storage {
  if (!cachedStorage) {
    cachedStorage = admin.storage(ensureAdminApp());
  }
  return cachedStorage;
}

const adminApp: App = createLazyServiceProxy<App>(() => ensureAdminApp());
const adminAuth: Auth = createLazyServiceProxy<Auth>(() => ensureAdminAuth());
const adminDb: Firestore = createLazyServiceProxy<Firestore>(() => ensureAdminDb());
const adminStorage: Storage = createLazyServiceProxy<Storage>(() => ensureAdminStorage());

export { adminApp, adminAuth, adminDb, adminStorage, isFirebaseAdminConfigured };
