/**
 * Premium Engine - Deterministic Fallback
 * Provides premium quotes when ML service is unavailable
 */

/**
 * Multiplier table: city_tier × zone_risk_band × shift_period
 */
const MULTIPLIER_TABLE: Record<string, Record<string, Record<string, number>>> = {
  // Tier 1 cities (Mumbai, Delhi, Bangalore)
  tier_1: {
    low_risk: {
      morning: 1.0,
      afternoon: 1.1,
      evening: 1.2,
      night: 1.3
    },
    medium_risk: {
      morning: 1.3,
      afternoon: 1.4,
      evening: 1.5,
      night: 1.6
    },
    high_risk: {
      morning: 1.6,
      afternoon: 1.7,
      evening: 1.8,
      night: 2.0
    }
  },
  // Tier 2 cities (Pune, Hyderabad, Chennai)
  tier_2: {
    low_risk: {
      morning: 0.9,
      afternoon: 1.0,
      evening: 1.1,
      night: 1.2
    },
    medium_risk: {
      morning: 1.2,
      afternoon: 1.3,
      evening: 1.4,
      night: 1.5
    },
    high_risk: {
      morning: 1.5,
      afternoon: 1.6,
      evening: 1.7,
      night: 1.9
    }
  },
  // Tier 3 cities (Smaller cities)
  tier_3: {
    low_risk: {
      morning: 0.8,
      afternoon: 0.9,
      evening: 1.0,
      night: 1.1
    },
    medium_risk: {
      morning: 1.1,
      afternoon: 1.2,
      evening: 1.3,
      night: 1.4
    },
    high_risk: {
      morning: 1.4,
      afternoon: 1.5,
      evening: 1.6,
      night: 1.8
    }
  }
};

/**
 * Base premium prices for each plan (in rupees)
 */
const BASE_PREMIUMS = {
  lite: 19,
  standard: 39,
  premium: 79
};

/**
 * Maximum weekly protection for each plan (in rupees)
 */
const MAX_PROTECTION = {
  lite: 500,
  standard: 1000,
  premium: 2000
};

/**
 * Premium quote response interface
 */
export interface PremiumQuote {
  request_id: string;
  worker_id: string;
  zone_id: string;
  city_tier: string;
  plans: {
    lite: PlanQuote;
    standard: PlanQuote;
    premium: PlanQuote;
  };
  model_used: 'ml_model' | 'fallback_rules' | 'floor_price';
  timestamp: string;
  metadata?: {
    multiplier?: number;
    zone_risk_band?: string;
    shift_period?: string;
    disruption_probability?: number;
  };
}

export interface PlanQuote {
  plan_name: string;
  weekly_premium: number;
  max_weekly_protection: number;
  expected_payout: number;
  roi_ratio: number;
}

/**
 * Feature vector for premium calculation
 */
export interface PremiumFeatureVector {
  worker_id: string;
  zone_id: string;
  city_tier: string;
  shift_start_hour: number;
  shift_duration_hours: number;
  declared_weekly_income_slab: string;
  claim_count_last_4_weeks: number;
  trust_score: number;
  days_since_registration: number;
  prior_zone_disruption_density: number;
  disruption_probability: number;
  week_of_year: number;
  season_flag: string;
}

/**
 * Calculate premium quote using deterministic fallback rules
 */
export function calculateFallbackPremium(features: PremiumFeatureVector): PremiumQuote {
  const startTime = Date.now();
  
  // Determine zone risk band based on disruption probability
  const zoneRiskBand = getZoneRiskBand(features.disruption_probability);
  
  // Determine shift period
  const shiftPeriod = getShiftPeriod(features.shift_start_hour);
  
  // Get multiplier from table
  const multiplier = getMultiplier(features.city_tier, zoneRiskBand, shiftPeriod);
  
  // Calculate premiums for each plan
  const litePremium = Math.round(BASE_PREMIUMS.lite * multiplier);
  const standardPremium = Math.round(BASE_PREMIUMS.standard * multiplier);
  const premiumPremium = Math.round(BASE_PREMIUMS.premium * multiplier);
  
  // Calculate expected payouts (based on disruption probability)
  const liteExpectedPayout = Math.round(MAX_PROTECTION.lite * features.disruption_probability);
  const standardExpectedPayout = Math.round(MAX_PROTECTION.standard * features.disruption_probability);
  const premiumExpectedPayout = Math.round(MAX_PROTECTION.premium * features.disruption_probability);
  
  // Calculate ROI ratios
  const liteRoi = liteExpectedPayout / litePremium;
  const standardRoi = standardExpectedPayout / standardPremium;
  const premiumRoi = premiumExpectedPayout / premiumPremium;
  
  const quote: PremiumQuote = {
    request_id: `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    worker_id: features.worker_id,
    zone_id: features.zone_id,
    city_tier: features.city_tier,
    plans: {
      lite: {
        plan_name: 'Lite',
        weekly_premium: litePremium,
        max_weekly_protection: MAX_PROTECTION.lite,
        expected_payout: liteExpectedPayout,
        roi_ratio: parseFloat(liteRoi.toFixed(2))
      },
      standard: {
        plan_name: 'Standard',
        weekly_premium: standardPremium,
        max_weekly_protection: MAX_PROTECTION.standard,
        expected_payout: standardExpectedPayout,
        roi_ratio: parseFloat(standardRoi.toFixed(2))
      },
      premium: {
        plan_name: 'Premium',
        weekly_premium: premiumPremium,
        max_weekly_protection: MAX_PROTECTION.premium,
        expected_payout: premiumExpectedPayout,
        roi_ratio: parseFloat(premiumRoi.toFixed(2))
      }
    },
    model_used: 'fallback_rules',
    timestamp: new Date().toISOString(),
    metadata: {
      multiplier,
      zone_risk_band: zoneRiskBand,
      shift_period: shiftPeriod,
      disruption_probability: features.disruption_probability
    }
  };
  
  const executionTime = Date.now() - startTime;
  console.log(`[Premium Engine] Fallback calculation completed in ${executionTime}ms`);
  
  return quote;
}

/**
 * Get floor price quote (last resort)
 */
export function getFloorPriceQuote(workerId: string, zoneId: string, cityTier: string): PremiumQuote {
  return {
    request_id: `floor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    worker_id: workerId,
    zone_id: zoneId,
    city_tier: cityTier,
    plans: {
      lite: {
        plan_name: 'Lite',
        weekly_premium: BASE_PREMIUMS.lite,
        max_weekly_protection: MAX_PROTECTION.lite,
        expected_payout: 0,
        roi_ratio: 0
      },
      standard: {
        plan_name: 'Standard',
        weekly_premium: BASE_PREMIUMS.standard,
        max_weekly_protection: MAX_PROTECTION.standard,
        expected_payout: 0,
        roi_ratio: 0
      },
      premium: {
        plan_name: 'Premium',
        weekly_premium: BASE_PREMIUMS.premium,
        max_weekly_protection: MAX_PROTECTION.premium,
        expected_payout: 0,
        roi_ratio: 0
      }
    },
    model_used: 'floor_price',
    timestamp: new Date().toISOString()
  };
}

/**
 * Determine zone risk band from disruption probability
 */
function getZoneRiskBand(disruptionProbability: number): string {
  if (disruptionProbability >= 0.3) return 'high_risk';
  if (disruptionProbability >= 0.15) return 'medium_risk';
  return 'low_risk';
}

/**
 * Determine shift period from start hour
 */
function getShiftPeriod(shiftStartHour: number): string {
  if (shiftStartHour >= 6 && shiftStartHour < 12) return 'morning';
  if (shiftStartHour >= 12 && shiftStartHour < 17) return 'afternoon';
  if (shiftStartHour >= 17 && shiftStartHour < 22) return 'evening';
  return 'night';
}

/**
 * Get multiplier from table
 */
function getMultiplier(cityTier: string, zoneRiskBand: string, shiftPeriod: string): number {
  // Normalize city tier
  const tier = cityTier.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  
  // Get multiplier from table with fallbacks
  const tierData = MULTIPLIER_TABLE[tier] || MULTIPLIER_TABLE.tier_2;
  const riskData = tierData[zoneRiskBand] || tierData.medium_risk;
  const multiplier = riskData[shiftPeriod] || 1.0;
  
  return multiplier;
}
