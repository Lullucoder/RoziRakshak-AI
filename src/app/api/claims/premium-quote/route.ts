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
    const now = Date.now();
    const rateLimitData = rateLimitStore.get(rateLimitKey);
    
    if (rateLimitData) {
      if (now < rateLimitData.resetAt) {
        if (rateLimitData.count >= RATE_LIMIT_MAX) {
          return NextResponse.json(
            { 
              error: 'Rate limit exceeded', 
              message: `Maximum ${RATE_LIMIT_MAX} quote requests per hour`,
              retry_after: Math.ceil((rateLimitData.resetAt - now) / 1000)
            },
            { status: 429 }
          );
        }
        rateLimitData.count++;
      } else {
        // Reset window
        rateLimitStore.set(rateLimitKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
      }
    } else {
      rateLimitStore.set(rateLimitKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
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
    const zoneId = worker.zone || 'zone_1';
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
    const features: PremiumFeatureVector = {
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
    
    console.log('[Premium Quote] Feature vector built:', features);
    
    // Step 5: Call ML premium engine
    let quote: PremiumQuote | null = null;
    
    try {
      const premiumResponse = await fetch(
        `${ML_SERVICE_URL}/premium/quote`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(features),
          signal: AbortSignal.timeout(ML_TIMEOUT_MS)
        }
      );
      
      if (premiumResponse.ok) {
        quote = await premiumResponse.json();
        console.log('[Premium Quote] ML service response received');
      } else {
        console.warn('[Premium Quote] ML service returned error:', premiumResponse.status);
      }
    } catch (error: any) {
      console.warn('[Premium Quote] ML service call failed:', error.message);
    }
    
    // Step 6: Use fallback if ML service failed
    if (!quote) {
      console.log('[Premium Quote] Using fallback premium engine');
      
      try {
        quote = calculateFallbackPremium(features);
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
function getSeason(date: Date): string {
  const month = date.getMonth() + 1; // 1-12
  
  // Indian seasons
  if (month >= 3 && month <= 5) return 'summer';
  if (month >= 6 && month <= 9) return 'monsoon';
  if (month >= 10 && month <= 11) return 'autumn';
  return 'winter';
}
