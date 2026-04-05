/**
 * Premium Quote API Route
 * POST /api/claims/premium-quote
 * 
 * Generates premium quotes for workers using ML service or fallback rules
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { 
  calculateFallbackPremium, 
  getFloorPriceQuote,
  type PremiumFeatureVector,
  type PremiumQuote 
} from '@/lib/premiumEngine';

const ML_SERVICE_URL = process.env.RENDER_ML_URL || 'https://ml-microservice-api.onrender.com';
const ML_TIMEOUT_MS = 3000;

// Rate limiting using in-memory store (replace with Upstash Redis in production)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

interface MLPremiumFeatures {
  city_tier: number;
  zone_id: string;
  week_of_year: number;
  season_flag: 'summer' | 'monsoon' | 'winter' | 'spring';
  forecasted_disruption_probability: number;
  shift_start_hour: number;
  shift_duration_hours: number;
  declared_weekly_income_slab: 500 | 1000 | 1500 | 2000 | 2500;
  claim_count_last_4_weeks: number;
  trust_score: number;
  days_since_registration: number;
  prior_zone_disruption_density: number;
}

interface MLPremiumResponse {
  premium_inr: number;
  risk_tier: 'Low' | 'Medium' | 'High' | string;
  top_reasons: string[];
  plan_recommendation: string;
  model_used: string;
}

/**
 * POST /api/claims/premium-quote
 */
export async function POST(request: NextRequest) {
  try {
    // Step 1: Authenticate request
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }
    
    const idToken = authHeader.split('Bearer ')[1];
    
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (error: any) {
      console.error('[Premium Quote] Token verification failed:', error.message);
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Invalid or expired token' },
        { status: 401 }
      );
    }
    
    const workerId = decodedToken.uid;
    
    console.log('[Premium Quote] Request from worker:', workerId);
    
    // Step 2: Rate limiting
    const rateLimitKey = `premium_quote:${workerId}`;
    const nowTimestamp = Date.now();
    const rateLimitData = rateLimitStore.get(rateLimitKey);
    
    if (rateLimitData) {
      if (nowTimestamp < rateLimitData.resetAt) {
        if (rateLimitData.count >= RATE_LIMIT_MAX) {
          return NextResponse.json(
            { 
              error: 'Rate limit exceeded', 
              message: `Maximum ${RATE_LIMIT_MAX} quote requests per hour`,
              retry_after: Math.ceil((rateLimitData.resetAt - nowTimestamp) / 1000)
            },
            { status: 429 }
          );
        }
        rateLimitData.count++;
      } else {
        // Reset window
        rateLimitStore.set(rateLimitKey, { count: 1, resetAt: nowTimestamp + RATE_LIMIT_WINDOW_MS });
      }
    } else {
      rateLimitStore.set(rateLimitKey, { count: 1, resetAt: nowTimestamp + RATE_LIMIT_WINDOW_MS });
    }
    
    // Step 3: Fetch worker profile
    const workerDoc = await adminDb.collection('workers').doc(workerId).get();
    
    if (!workerDoc.exists) {
      return NextResponse.json(
        { error: 'Worker not found', message: 'Worker profile does not exist' },
        { status: 404 }
      );
    }
    
    const worker = workerDoc.data()!;
    
    console.log('[Premium Quote] Worker profile loaded:', {
      workerId,
      zone: worker.zone,
      city: worker.city
    });
    
    // Build feature vector
    const zoneId = normalizeZoneId(worker.zone);
    const cityTier = getCityTier(worker.city);
    
    // Calculate days since registration
    const daysSinceRegistration = worker.joinedDate 
      ? Math.floor((Date.now() - worker.joinedDate.toMillis()) / (1000 * 60 * 60 * 24))
      : 0;
    
    // Get current week and season
    const now = new Date();
    const weekOfYear = getWeekOfYear(now);
    const seasonFlag = getSeason(now);
    
    // Step 4: Fetch disruption forecast
    let disruptionProbability = 0.1; // Default
    
    try {
      const forecastResponse = await fetch(
        `${ML_SERVICE_URL}/forecast/${zoneId}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(ML_TIMEOUT_MS)
        }
      );
      
      if (forecastResponse.ok) {
        const forecastData = await forecastResponse.json();
        disruptionProbability = forecastData.next_week_summary?.average_disruption_probability || 0.1;
        
        console.log('[Premium Quote] Forecast fetched:', {
          zoneId,
          disruptionProbability
        });
      }
    } catch (error: any) {
      console.warn('[Premium Quote] Forecast fetch failed, using default:', error.message);
    }
    
    // Build complete feature vector
    const fallbackFeatures: PremiumFeatureVector = {
      worker_id: workerId,
      zone_id: zoneId,
      city_tier: cityTier,
      shift_start_hour: worker.shiftStartHour || 9,
      shift_duration_hours: worker.shiftDurationHours || 8,
      declared_weekly_income_slab: worker.weeklyIncomeSlab || 'medium',
      claim_count_last_4_weeks: worker.claimCountLast4Weeks || 0,
      trust_score: worker.trustScore || 0.8,
      days_since_registration: daysSinceRegistration,
      prior_zone_disruption_density: worker.priorZoneDisruptionDensity || 0.1,
      disruption_probability: disruptionProbability,
      week_of_year: weekOfYear,
      season_flag: seasonFlag
    };

    const mlFeatures: MLPremiumFeatures = {
      city_tier: getCityTierCode(worker.city),
      zone_id: zoneId,
      week_of_year: Math.max(1, Math.min(52, weekOfYear)),
      season_flag: seasonFlag,
      forecasted_disruption_probability: Math.max(0, Math.min(1, disruptionProbability)),
      shift_start_hour: getShiftStartHour(worker),
      shift_duration_hours: getShiftDuration(worker),
      declared_weekly_income_slab: getIncomeSlabValue(worker),
      claim_count_last_4_weeks: Number(worker.claimCountLast4Weeks || 0),
      trust_score: Math.max(0, Math.min(1, Number(worker.trustScore || 0.8))),
      days_since_registration: Math.max(1, daysSinceRegistration),
      prior_zone_disruption_density: Math.max(0, Math.min(1, Number(worker.priorZoneDisruptionDensity || 0.1))),
    };
    
    console.log('[Premium Quote] Feature vectors built:', {
      fallbackFeatures,
      mlFeatures
    });
    
    // Step 5: Call ML premium engine
    let quote: PremiumQuote | null = null;
    
    try {
      const premiumResponse = await fetch(
        `${ML_SERVICE_URL}/premium/quote`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mlFeatures),
          signal: AbortSignal.timeout(ML_TIMEOUT_MS)
        }
      );
      
      if (premiumResponse.ok) {
        const mlResponse = await premiumResponse.json() as MLPremiumResponse;
        quote = mapMlPremiumToQuote(workerId, zoneId, cityTier, mlFeatures, mlResponse);
        console.log('[Premium Quote] ML service response received');
      } else {
        const body = await premiumResponse.text();
        console.warn('[Premium Quote] ML service returned error:', premiumResponse.status, body);
      }
    } catch (error: any) {
      console.warn('[Premium Quote] ML service call failed:', error.message);
    }
    
    // Step 6: Use fallback if ML service failed
    if (!quote) {
      console.log('[Premium Quote] Using fallback premium engine');
      
      try {
        quote = calculateFallbackPremium(fallbackFeatures);
      } catch (error: any) {
        console.error('[Premium Quote] Fallback engine failed:', error.message);
        
        // Step 7: Last resort - floor price
        console.log('[Premium Quote] Using floor price as last resort');
        quote = getFloorPriceQuote(workerId, zoneId, cityTier);
      }
    }
    
    // Step 8: Return quote
    console.log('[Premium Quote] Returning quote:', {
      workerId,
      modelUsed: quote.model_used,
      litePremium: quote.plans.lite.weekly_premium
    });
    
    return NextResponse.json(quote, { status: 200 });
    
  } catch (error: any) {
    console.error('[Premium Quote] Unexpected error:', {
      message: error.message,
      stack: error.stack
    });
    
    // Never return 500 - return floor price instead
    try {
      const quote = getFloorPriceQuote('unknown', 'zone_1', 'tier_2');
      return NextResponse.json(quote, { status: 200 });
    } catch (fallbackError: any) {
      // Absolute last resort
      return NextResponse.json(
        {
          error: 'Service temporarily unavailable',
          message: 'Please try again later'
        },
        { status: 503 }
      );
    }
  }
}

/**
 * Get city tier from city name
 */
function getCityTier(city: string): string {
  const tier1Cities = ['mumbai', 'delhi', 'bangalore', 'bengaluru'];
  const tier2Cities = ['pune', 'hyderabad', 'chennai', 'kolkata', 'ahmedabad'];
  
  const cityLower = (city || '').toLowerCase();
  
  if (tier1Cities.includes(cityLower)) return 'tier_1';
  if (tier2Cities.includes(cityLower)) return 'tier_2';
  return 'tier_3';
}

function getCityTierCode(city: string): 1 | 2 | 3 {
  const tier = getCityTier(city);
  if (tier === 'tier_1') return 1;
  if (tier === 'tier_2') return 2;
  return 3;
}

/**
 * Get week of year (1-52)
 */
function getWeekOfYear(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

/**
 * Get season flag
 */
function getSeason(date: Date): 'summer' | 'monsoon' | 'winter' | 'spring' {
  const month = date.getMonth() + 1; // 1-12
  
  // Indian seasons
  if (month >= 3 && month <= 5) return 'summer';
  if (month >= 6 && month <= 9) return 'monsoon';
  if (month >= 10 && month <= 11) return 'spring';
  return 'winter';
}

function normalizeZoneId(rawZone: string | undefined): string {
  if (!rawZone) return 'zone_001';
  const trimmed = rawZone.trim().toLowerCase();
  const zoneMatch = trimmed.match(/^zone[_\-]?(\d{1,3})$/);
  if (zoneMatch) {
    return `zone_${zoneMatch[1].padStart(3, '0')}`;
  }

  const slug = trimmed
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return slug ? slug : 'zone_001';
}

function getShiftStartHour(worker: any): number {
  if (typeof worker.shiftStartHour === 'number') {
    return Math.max(0, Math.min(23, worker.shiftStartHour));
  }

  const workingHours = String(worker.workingHours || '').toLowerCase();
  if (workingHours.includes('morning')) return 8;
  if (workingHours.includes('afternoon')) return 13;
  if (workingHours.includes('evening')) return 18;
  if (workingHours.includes('full_day')) return 9;
  return 9;
}

function getShiftDuration(worker: any): number {
  if (typeof worker.shiftDurationHours === 'number') {
    return Math.max(4, Math.min(12, worker.shiftDurationHours));
  }

  const workingHours = String(worker.workingHours || '').toLowerCase();
  if (workingHours.includes('full_day')) return 10;
  return 8;
}

function getIncomeSlabValue(worker: any): 500 | 1000 | 1500 | 2000 | 2500 {
  const explicit = Number(worker.declaredWeeklyIncomeSlab || worker.weeklyIncomeSlabValue);
  const valid = [500, 1000, 1500, 2000, 2500];
  if (valid.includes(explicit)) {
    return explicit as 500 | 1000 | 1500 | 2000 | 2500;
  }

  const weeklyRange = String(worker.weeklyEarningRange || worker.weeklyIncomeSlab || '').toLowerCase();
  if (weeklyRange.includes('12,000') || weeklyRange.includes('12000')) return 2500;
  if (weeklyRange.includes('8,000') || weeklyRange.includes('8000')) return 2000;
  if (weeklyRange.includes('6,000') || weeklyRange.includes('6000')) return 1500;
  if (weeklyRange.includes('4,000') || weeklyRange.includes('4000')) return 1000;
  return 500;
}

function mapMlPremiumToQuote(
  workerId: string,
  zoneId: string,
  cityTier: string,
  features: MLPremiumFeatures,
  mlResponse: MLPremiumResponse
): PremiumQuote {
  const basePremium = Math.max(19, Math.round(Number(mlResponse.premium_inr || 39)));
  const litePremium = Math.max(19, Math.round(basePremium * 0.72));
  const standardPremium = Math.max(29, Math.round(basePremium));
  const premiumPremium = Math.max(49, Math.round(basePremium * 1.55));

  const maxProtection = {
    lite: 800,
    standard: 1500,
    premium: 2500,
  };

  const liteExpectedPayout = Math.round(maxProtection.lite * features.forecasted_disruption_probability);
  const standardExpectedPayout = Math.round(maxProtection.standard * features.forecasted_disruption_probability);
  const premiumExpectedPayout = Math.round(maxProtection.premium * features.forecasted_disruption_probability);

  return {
    request_id: `ml_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    worker_id: workerId,
    zone_id: zoneId,
    city_tier: cityTier,
    plans: {
      lite: {
        plan_name: 'Lite',
        weekly_premium: litePremium,
        max_weekly_protection: maxProtection.lite,
        expected_payout: liteExpectedPayout,
        roi_ratio: Number((liteExpectedPayout / litePremium).toFixed(2)),
      },
      standard: {
        plan_name: 'Core',
        weekly_premium: standardPremium,
        max_weekly_protection: maxProtection.standard,
        expected_payout: standardExpectedPayout,
        roi_ratio: Number((standardExpectedPayout / standardPremium).toFixed(2)),
      },
      premium: {
        plan_name: 'Peak',
        weekly_premium: premiumPremium,
        max_weekly_protection: maxProtection.premium,
        expected_payout: premiumExpectedPayout,
        roi_ratio: Number((premiumExpectedPayout / premiumPremium).toFixed(2)),
      },
    },
    model_used: 'ml_model',
    timestamp: new Date().toISOString(),
    metadata: {
      zone_risk_band: String(mlResponse.risk_tier || 'Medium').toLowerCase(),
      disruption_probability: features.forecasted_disruption_probability,
    },
  };
}
