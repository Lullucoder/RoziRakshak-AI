import { BaseDocument, FirestoreTimestamp } from "./firestore";

// ─── Shared Enums ─────────────────────────────────────────────────────────────

/** User role within the platform. */
export type UserRole = "worker" | "admin";

/** Typical working shift declared during onboarding. */
export type WorkingHoursType = "morning" | "afternoon" | "evening" | "full_day";

/** Weekly insurance plan tier. */
export type PlanTier = "lite" | "core" | "peak";

// ─── WorkerProfile Document ──────────────────────────────────────────────────

/**
 * Firestore collection: `workers`
 *
 * Represents a registered delivery partner (or admin user).
 * Created during onboarding; updated when profile fields change.
 */
export interface WorkerProfile extends BaseDocument {
  /** Firebase Auth UID or deterministic demo UID. */
  uid: string;

  /** Phone number with country code, e.g. "+919876543210". */
  phone: string;

  /** Display name. */
  name: string;

  /** City of operation, e.g. "Bengaluru", "Delhi". */
  city: string;

  /** Gig platform the worker operates on, e.g. "Zepto", "Blinkit". */
  platform: string;

  /** Primary delivery zone name, e.g. "Koramangala". */
  zone: string;

  /** Declared typical working shift. */
  workingHours: WorkingHoursType | string;

  /** Self-reported weekly earning range, e.g. "₹6,000–₹8,000". */
  weeklyEarningRange: string;

  /** UPI virtual payment address for payouts, e.g. "arjun@upi". */
  upiId: string;

  /** Role within the app. */
  role: UserRole;

  /** Whether the worker has completed the full onboarding flow. */
  isOnboarded: boolean;

  /**
   * AI-computed trust score (0 – 1).
   * Higher trust → lower premiums. Updated weekly.
   */
  trustScore: number;

  /** Currently active plan tier, or `null` if no active policy. */
  activePlan: PlanTier | null;

  /** Lifetime count of claims filed by this worker. */
  claimsCount: number;

  /** Date the worker first registered. */
  joinedDate: FirestoreTimestamp;

  // ─── KYC / Identity ────────────────────────────────────────────────────────

  /** Whether Aadhaar KYC was completed during onboarding. */
  aadhaar_verified?: boolean;

  /** Masked Aadhaar number, e.g. "XXXX-XXXX-3421". Never stores full number. */
  aadhaar_masked?: string;

  /** Timestamp when Aadhaar verification was completed. */
  aadhaar_verified_at?: FirestoreTimestamp;

  /** Which KYC method was used. */
  kyc_method?: "digilocker_mock";
}
