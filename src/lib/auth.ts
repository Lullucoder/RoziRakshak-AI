/**
 * Firebase Auth — client-side helpers.
 *
 * These are pure functions (not hooks) that wrap the Firebase Auth SDK.
 * They handle phone-number formatting, error mapping, and nothing else —
 * no React state, no context, no DOM side-effects.
 */

import {
  signInWithPhoneNumber,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  type ConfirmationResult,
  type ApplicationVerifier,
  type UserCredential,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

// ─── Typed Error Codes ────────────────────────────────────────────────────────

export type AuthErrorCode =
  | "invalid-phone"
  | "too-many-requests"
  | "recaptcha-failed"
  | "unauthorized-domain"
  | "provider-disabled"
  | "quota-exceeded"
  | "network"
  | "billing-not-enabled"
  | "invalid-otp"
  | "otp-expired"
  | "unknown";

export class AuthError extends Error {
  code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

// ─── Phone Formatting ─────────────────────────────────────────────────────────

/**
 * Normalise a phone input to E.164 format with +91 prefix.
 *
 * Accepts:
 *   "9876543210"       → "+919876543210"
 *   "+919876543210"    → "+919876543210"
 *   "919876543210"     → "+919876543210"
 *   "  +91 98765 43210 " → "+919876543210"
 *
 * Throws `AuthError("invalid-phone")` if the result is not exactly
 * 10 digits after the country code.
 */
export function formatPhoneNumber(raw: string): string {
  // Strip all whitespace and dashes
  let cleaned = raw.replace(/[\s\-()]/g, "");

  // Remove leading +91 or 91 prefix if present
  if (cleaned.startsWith("+91")) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith("91") && cleaned.length > 10) {
    cleaned = cleaned.slice(2);
  }

  // Must be exactly 10 digits
  if (!/^\d{10}$/.test(cleaned)) {
    throw new AuthError(
      "invalid-phone",
      "Phone number must be exactly 10 digits."
    );
  }

  return `+91${cleaned}`;
}

// ─── Firebase Error → AuthErrorCode Mapping ───────────────────────────────────

function mapFirebaseError(err: unknown): AuthError {
  const code =
    err && typeof err === "object" && "code" in err
      ? (err as { code: string }).code
      : "";

  const message =
    err && typeof err === "object" && "message" in err
      ? String((err as { message?: unknown }).message ?? "")
      : "";

  const currentHost =
    typeof window !== "undefined" ? window.location.hostname : "this host";

  switch (code) {
    case "auth/invalid-phone-number":
      return new AuthError("invalid-phone", "The phone number is invalid.");

    case "auth/too-many-requests":
      return new AuthError(
        "too-many-requests",
        "Too many attempts. Please wait a few minutes before trying again."
      );

    case "auth/captcha-check-failed":
      if (/hostname match not found/i.test(message)) {
        return new AuthError(
          "unauthorized-domain",
          `Hostname mismatch for reCAPTCHA on ${currentHost}. Add this hostname to Firebase Authentication > Settings > Authorized domains (no protocol, no port), then refresh and try again.`
        );
      }

      return new AuthError(
        "recaptcha-failed",
        "reCAPTCHA verification failed. Disable ad blockers/privacy shields, allow third-party cookies, refresh the page, and try again."
      );

    case "auth/recaptcha-not-enabled":
    case "auth/missing-recaptcha-token":
    case "auth/invalid-app-credential":
    case "auth/app-not-authorized":
      return new AuthError(
        "recaptcha-failed",
        "reCAPTCHA verification failed. Disable ad blockers/privacy shields, allow third-party cookies, refresh the page, and try again."
      );

    case "auth/unauthorized-domain":
      return new AuthError(
        "unauthorized-domain",
        "This domain is not authorized for Firebase Auth. Add your current host to Firebase Authentication > Settings > Authorized domains."
      );

    case "auth/operation-not-allowed":
      return new AuthError(
        "provider-disabled",
        "Phone sign-in is not enabled for this Firebase project. Enable Phone provider in Firebase Authentication > Sign-in method."
      );

    case "auth/quota-exceeded":
      return new AuthError(
        "quota-exceeded",
        "SMS quota exceeded for this project. Wait and retry, or review quotas in Firebase/Google Cloud console."
      );

    case "auth/network-request-failed":
      return new AuthError(
        "network",
        "Network blocked the verification request. Check VPN/proxy/firewall and try again."
      );

    case "auth/billing-not-enabled":
      return new AuthError(
        "billing-not-enabled",
        "Phone authentication for real numbers requires billing on your Firebase project. Enable Billing (Blaze plan) in Firebase/Google Cloud and try again."
      );

    case "auth/invalid-verification-code":
      return new AuthError("invalid-otp", "The OTP you entered is incorrect.");

    case "auth/code-expired":
      return new AuthError(
        "otp-expired",
        "The OTP has expired. Please request a new one."
      );

    default:
      return new AuthError(
        "unknown",
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Send a one-time password to the given phone number via Firebase Phone Auth.
 *
 * @param phoneNumber  Raw phone input (e.g. "9876543210" or "+919876543210")
 * @param recaptchaVerifier  A RecaptchaVerifier instance from `useRecaptcha()`
 * @returns  The `ConfirmationResult` needed by `verifyOTP()`
 */
export async function sendOTP(
  phoneNumber: string,
  recaptchaVerifier: ApplicationVerifier
): Promise<ConfirmationResult> {
  const formatted = formatPhoneNumber(phoneNumber); // throws AuthError

  try {
    const confirmationResult = await signInWithPhoneNumber(
      auth,
      formatted,
      recaptchaVerifier
    );
    return confirmationResult;
  } catch (err) {
    if (err && typeof err === "object") {
      const firebaseErr = err as {
        code?: string;
        message?: string;
        name?: string;
        customData?: unknown;
      };

      console.error("sendOTP failed", {
        code: firebaseErr.code,
        message: firebaseErr.message,
        name: firebaseErr.name,
        customData: firebaseErr.customData,
        hostname: typeof window !== "undefined" ? window.location.hostname : undefined,
      });

      console.error(
        "sendOTP failed details:",
        firebaseErr.code ?? "unknown-code",
        firebaseErr.message ?? "no-message"
      );
    }

    throw mapFirebaseError(err);
  }
}

/**
 * Verify the 6-digit OTP the user received.
 *
 * @param confirmationResult  The object returned by `sendOTP()`
 * @param otp  The 6-digit code entered by the user
 * @returns  Firebase `UserCredential` on success
 */
export async function verifyOTP(
  confirmationResult: ConfirmationResult,
  otp: string
): Promise<UserCredential> {
  const code = otp.trim();

  if (!/^\d{6}$/.test(code)) {
    throw new AuthError("invalid-otp", "OTP must be exactly 6 digits.");
  }

  try {
    return await confirmationResult.confirm(code);
  } catch (err) {
    throw mapFirebaseError(err);
  }
}

/**
 * Sign in with Google via popup.
 *
 * @returns  Firebase `UserCredential` on success
 */
export async function signInWithGoogle(): Promise<UserCredential> {
  try {
    const provider = new GoogleAuthProvider();
    return await signInWithPopup(auth, provider);
  } catch (err) {
    throw mapFirebaseError(err);
  }
}

/**
 * Sign the current user out of Firebase Auth.
 */
export async function firebaseSignOut(): Promise<void> {
  await signOut(auth);
}
