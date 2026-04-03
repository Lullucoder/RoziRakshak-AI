// ─── Dashboard Stats (API response shape, not a Firestore document) ──────────

/**
 * Aggregated statistics for the admin analytics dashboard.
 * This is NOT backed by a single Firestore document — it is computed
 * server-side from real-time queries across multiple collections.
 */
export interface DashboardStats {
  /** Total number of active (onboarded) workers. */
  activeUsers: number;

  /** Number of policies with status "active" this week. */
  activePolicies: number;

  /** Number of claims created in the current week. */
  claimsThisWeek: number;

  /** Total payout volume disbursed this week in ₹. */
  payoutVolume: number;

  /** Breakdown of claims by trigger type. */
  claimsByTrigger: ClaimsByTrigger[];

  /** Weekly trends for claims, payouts, and loss ratio. */
  weeklyTrends: WeeklyTrend[];

  /** Per-city statistics: worker count and risk level. */
  cityStats: CityStat[];
}

/** Claims count grouped by trigger type. */
export interface ClaimsByTrigger {
  type: string;
  count: number;
}

/** Weekly trend data point for the admin trend chart. */
export interface WeeklyTrend {
  week: string;
  claims: number;
  payouts: number;
  lossRatio: number;
}

/** Per-city aggregate statistics. */
export interface CityStat {
  city: string;
  workers: number;
  risk: number;
}
