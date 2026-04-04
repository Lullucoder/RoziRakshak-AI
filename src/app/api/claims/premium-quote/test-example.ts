/**
 * Premium Quote API - Test Examples
 * 
 * This file demonstrates how to call the premium quote API
 * from different contexts (client-side, server-side, tests)
 */

import { getAuth } from 'firebase/auth';

/**
 * Example 1: Client-side usage (React component)
 */
export async function fetchPremiumQuoteClient() {
  try {
    // Get current user's ID token
    const auth = getAuth();
    const user = auth.currentUser;
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    const idToken = await user.getIdToken();
    
    // Call API
    const response = await fetch('/api/claims/premium-quote', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch premium quote');
    }
    
    const quote = await response.json();
    
    console.log('Premium Quote:', {
      lite: quote.plans.lite.weekly_premium,
      standard: quote.plans.standard.weekly_premium,
      premium: quote.plans.premium.weekly_premium,
      modelUsed: quote.model_used
    });
    
    return quote;
    
  } catch (error: any) {
    console.error('Error fetching premium quote:', error.message);
    throw error;
  }
}

/**
 * Example 2: Server-side usage (API route or server component)
 */
export async function fetchPremiumQuoteServer(idToken: string) {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/claims/premium-quote`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch premium quote');
    }
    
    return await response.json();
    
  } catch (error: any) {
    console.error('Error fetching premium quote:', error.message);
    throw error;
  }
}

/**
 * Example 3: React hook for premium quotes
 */
export function usePremiumQuote() {
  const [quote, setQuote] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  
  const fetchQuote = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await fetchPremiumQuoteClient();
      setQuote(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  return { quote, loading, error, fetchQuote };
}

/**
 * Example 4: Test data for development
 */
export const mockPremiumQuote = {
  request_id: 'test_1234567890_abc123',
  worker_id: 'test_worker_123',
  zone_id: 'zone_mumbai_central',
  city_tier: 'tier_1',
  plans: {
    lite: {
      plan_name: 'Lite',
      weekly_premium: 25,
      max_weekly_protection: 500,
      expected_payout: 50,
      roi_ratio: 2.0
    },
    standard: {
      plan_name: 'Standard',
      weekly_premium: 52,
      max_weekly_protection: 1000,
      expected_payout: 100,
      roi_ratio: 1.92
    },
    premium: {
      plan_name: 'Premium',
      weekly_premium: 105,
      max_weekly_protection: 2000,
      expected_payout: 200,
      roi_ratio: 1.90
    }
  },
  model_used: 'ml_model' as const,
  timestamp: new Date().toISOString(),
  metadata: {
    multiplier: 1.3,
    zone_risk_band: 'medium_risk',
    shift_period: 'morning',
    disruption_probability: 0.1
  }
};

/**
 * Example 5: Error handling patterns
 */
export async function fetchPremiumQuoteWithRetry(maxRetries = 3) {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fetchPremiumQuoteClient();
    } catch (error: any) {
      lastError = error;
      
      // Don't retry on authentication errors
      if (error.message.includes('Unauthorized')) {
        throw error;
      }
      
      // Don't retry on rate limit errors
      if (error.message.includes('Rate limit')) {
        throw error;
      }
      
      // Wait before retrying (exponential backoff)
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Failed to fetch premium quote after retries');
}

/**
 * Example 6: Comparing plans
 */
export function comparePlans(quote: any) {
  const plans = [
    { name: 'Lite', ...quote.plans.lite },
    { name: 'Standard', ...quote.plans.standard },
    { name: 'Premium', ...quote.plans.premium }
  ];
  
  // Sort by ROI (best value first)
  const sortedByRoi = [...plans].sort((a, b) => b.roi_ratio - a.roi_ratio);
  
  // Sort by premium (cheapest first)
  const sortedByPrice = [...plans].sort((a, b) => a.weekly_premium - b.weekly_premium);
  
  // Sort by protection (highest coverage first)
  const sortedByProtection = [...plans].sort((a, b) => b.max_weekly_protection - a.max_weekly_protection);
  
  return {
    bestValue: sortedByRoi[0],
    cheapest: sortedByPrice[0],
    mostProtection: sortedByProtection[0],
    allPlans: plans
  };
}

/**
 * Example 7: Format premium for display
 */
export function formatPremium(amount: number): string {
  return `₹${amount}`;
}

export function formatProtection(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function formatRoi(ratio: number): string {
  return `${ratio.toFixed(2)}x`;
}

// Note: Add React import if using the hook
declare const React: any;
