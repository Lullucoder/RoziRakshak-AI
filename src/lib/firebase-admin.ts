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

const PEM_BEGIN = "-----BEGIN PRIVATE KEY-----";
const PEM_END = "-----END PRIVATE KEY-----";

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function normalizeAdminPrivateKey(rawValue: string): string {
  const unquoted = stripWrappingQuotes(rawValue);

  // Support common deployment formats:
  // 1) JSON-style escaped newlines (\n)
  // 2) Escaped carriage returns (\r)
  // 3) Windows newlines (\r\n)
  const normalized = unquoted
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  // Some deployments store the key as base64-encoded PEM.
  const maybeBase64 = normalized.replace(/\s+/g, "");
  if (!normalized.includes(PEM_BEGIN) && /^[A-Za-z0-9+/=]+$/.test(maybeBase64)) {
    try {
      const decoded = Buffer.from(maybeBase64, "base64").toString("utf8").trim();
      if (decoded.includes(PEM_BEGIN) && decoded.includes(PEM_END)) {
        return normalizeAdminPrivateKey(decoded);
      }
    } catch {
      // Not valid base64 PEM; continue with normal parsing path.
    }
  }

  if (!normalized.includes(PEM_BEGIN) || !normalized.includes(PEM_END)) {
    return normalized;
  }

  // Canonicalize PEM to avoid formatting issues from copy/paste in env UIs.
  const beginIdx = normalized.indexOf(PEM_BEGIN);
  const endIdx = normalized.indexOf(PEM_END);
  const keyBodyRaw = normalized
    .slice(beginIdx + PEM_BEGIN.length, endIdx)
    .replace(/\s+/g, "");

  const chunks = keyBodyRaw.match(/.{1,64}/g) ?? [];
  return `${PEM_BEGIN}\n${chunks.join("\n")}\n${PEM_END}\n`;
}

function sanitizeEnvValue(rawValue: string): string {
  return stripWrappingQuotes(rawValue);
}

function getServiceAccountFromEnv(): ServiceAccount {
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY!;
  const rawProjectId = process.env.FIREBASE_ADMIN_PROJECT_ID!;
  const rawClientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL!;
  const parsedKey = normalizeAdminPrivateKey(rawKey);

  return {
    projectId: sanitizeEnvValue(rawProjectId),
    clientEmail: sanitizeEnvValue(rawClientEmail),
    privateKey: parsedKey,
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
