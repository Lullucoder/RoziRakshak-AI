# Premium Quote API - Quick Start Guide

## 🚀 Getting Started in 5 Minutes

### Step 1: Environment Setup

Add these environment variables to your `.env.local`:

```env
# Firebase Admin (required)
FIREBASE_ADMIN_PROJECT_ID=your-project-id
FIREBASE_ADMIN_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# ML Service (required)
RENDER_ML_URL=https://ml-microservice-api.onrender.com

# Optional: Upstash Redis for production rate limiting
UPSTASH_REDIS_URL=https://your-redis-url.upstash.io
UPSTASH_REDIS_TOKEN=your-redis-token
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Test the Endpoint

#### Option A: Using cURL

```bash
# Get your Firebase ID token first
curl -X POST http://localhost:3000/api/claims/premium-quote \
  -H "Authorization: Bearer YOUR_FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json"
```

#### Option B: Using JavaScript

```javascript
import { getAuth } from 'firebase/auth';

async function getPremiumQuote() {
  const auth = getAuth();
  const user = auth.currentUser;
  const token = await user.getIdToken();
  
  const response = await fetch('/api/claims/premium-quote', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const quote = await response.json();
  console.log(quote);
}
```

### Step 4: Integrate into Your App

#### React Component Example

```tsx
'use client';

import { useState } from 'react';
import { getAuth } from 'firebase/auth';

export default function PremiumQuotePage() {
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const fetchQuote = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error('Please sign in first');
      }
      
      const token = await user.getIdToken();
      
      const response = await fetch('/api/claims/premium-quote', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }
      
      const data = await response.json();
      setQuote(data);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Get Premium Quote</h1>
      
      <button
        onClick={fetchQuote}
        disabled={loading}
        className="bg-blue-500 text-white px-4 py-2 rounded"
      >
        {loading ? 'Loading...' : 'Get Quote'}
      </button>
      
      {error && (
        <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}
      
      {quote && (
        <div className="mt-4 space-y-4">
          <div className="p-4 border rounded">
            <h3 className="font-bold">Lite Plan</h3>
            <p>Premium: ₹{quote.plans.lite.weekly_premium}/week</p>
            <p>Coverage: ₹{quote.plans.lite.max_weekly_protection}</p>
            <p>ROI: {quote.plans.lite.roi_ratio}x</p>
          </div>
          
          <div className="p-4 border rounded">
            <h3 className="font-bold">Standard Plan</h3>
            <p>Premium: ₹{quote.plans.standard.weekly_premium}/week</p>
            <p>Coverage: ₹{quote.plans.standard.max_weekly_protection}</p>
            <p>ROI: {quote.plans.standard.roi_ratio}x</p>
          </div>
          
          <div className="p-4 border rounded">
            <h3 className="font-bold">Premium Plan</h3>
            <p>Premium: ₹{quote.plans.premium.weekly_premium}/week</p>
            <p>Coverage: ₹{quote.plans.premium.max_weekly_protection}</p>
            <p>ROI: {quote.plans.premium.roi_ratio}x</p>
          </div>
          
          <p className="text-sm text-gray-500">
            Model used: {quote.model_used}
          </p>
        </div>
      )}
    </div>
  );
}
```

## 📊 Understanding the Response

### Success Response (200 OK)

```json
{
  "request_id": "ml_1234567890_abc123",
  "worker_id": "worker_uid_123",
  "zone_id": "zone_mumbai_central",
  "city_tier": "tier_1",
  "plans": {
    "lite": {
      "plan_name": "Lite",
      "weekly_premium": 25,
      "max_weekly_protection": 500,
      "expected_payout": 50,
      "roi_ratio": 2.0
    },
    "standard": { ... },
    "premium": { ... }
  },
  "model_used": "ml_model",
  "timestamp": "2026-04-04T19:45:00.000Z"
}
```

### Key Fields Explained

- **weekly_premium**: Amount worker pays per week (in rupees)
- **max_weekly_protection**: Maximum payout if claim approved (in rupees)
- **expected_payout**: Estimated payout based on disruption probability
- **roi_ratio**: Return on investment (expected_payout / weekly_premium)
- **model_used**: Which pricing model was used
  - `ml_model`: ML service (most accurate)
  - `fallback_rules`: Deterministic fallback (good accuracy)
  - `floor_price`: Last resort (base prices)

## 🔧 Common Issues & Solutions

### Issue 1: 401 Unauthorized

**Problem**: Missing or invalid Firebase token

**Solution**:
```javascript
// Make sure user is signed in
const auth = getAuth();
const user = auth.currentUser;

if (!user) {
  // Redirect to login
  router.push('/login');
  return;
}

// Get fresh token
const token = await user.getIdToken(true); // Force refresh
```

### Issue 2: 429 Rate Limit Exceeded

**Problem**: Too many requests (>10 per hour)

**Solution**:
```javascript
// Cache the quote for 5 minutes
const CACHE_KEY = 'premium_quote_cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedQuote() {
  const cached = localStorage.getItem(CACHE_KEY);
  if (!cached) return null;
  
  const { quote, timestamp } = JSON.parse(cached);
  if (Date.now() - timestamp > CACHE_TTL) {
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
  
  return quote;
}

function setCachedQuote(quote) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({
    quote,
    timestamp: Date.now()
  }));
}

// Use cached quote if available
const cached = getCachedQuote();
if (cached) {
  setQuote(cached);
  return;
}

// Otherwise fetch new quote
const quote = await fetchQuote();
setCachedQuote(quote);
```

### Issue 3: 404 Worker Not Found

**Problem**: Worker profile doesn't exist in Firestore

**Solution**:
```javascript
// Make sure worker profile is created during onboarding
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

async function createWorkerProfile(userId, data) {
  await setDoc(doc(db, 'workers', userId), {
    zone: data.zone,
    city: data.city,
    shiftStartHour: data.shiftStartHour,
    shiftDurationHours: data.shiftDurationHours,
    weeklyIncomeSlab: data.weeklyIncomeSlab,
    trustScore: 0.8, // Default
    claimCountLast4Weeks: 0,
    joinedDate: new Date(),
    priorZoneDisruptionDensity: 0.1 // Default
  });
}
```

## 🎯 Best Practices

### 1. Cache Quotes

Don't fetch a new quote on every page load. Cache for 5-10 minutes:

```javascript
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

function usePremiumQuote() {
  const [quote, setQuote] = useState(null);
  const [lastFetch, setLastFetch] = useState(0);
  
  const fetchQuote = async () => {
    // Check if cache is still valid
    if (Date.now() - lastFetch < CACHE_DURATION && quote) {
      return quote;
    }
    
    // Fetch new quote
    const newQuote = await fetchPremiumQuote();
    setQuote(newQuote);
    setLastFetch(Date.now());
    return newQuote;
  };
  
  return { quote, fetchQuote };
}
```

### 2. Handle Errors Gracefully

```javascript
async function fetchQuoteWithFallback() {
  try {
    return await fetchPremiumQuote();
  } catch (error) {
    // Show cached quote if available
    const cached = getCachedQuote();
    if (cached) {
      console.warn('Using cached quote due to error:', error);
      return cached;
    }
    
    // Show default quote as last resort
    return {
      plans: {
        lite: { weekly_premium: 19, max_weekly_protection: 500 },
        standard: { weekly_premium: 39, max_weekly_protection: 1000 },
        premium: { weekly_premium: 79, max_weekly_protection: 2000 }
      },
      model_used: 'default'
    };
  }
}
```

### 3. Show Loading States

```javascript
function PremiumQuoteCard() {
  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState(null);
  
  useEffect(() => {
    fetchQuote().then(setQuote).finally(() => setLoading(false));
  }, []);
  
  if (loading) {
    return <Skeleton />;
  }
  
  return <QuoteDisplay quote={quote} />;
}
```

### 4. Implement Retry Logic

```javascript
async function fetchWithRetry(maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetchPremiumQuote();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      // Exponential backoff
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
    }
  }
}
```

## 📈 Monitoring

### Log Important Events

```javascript
// Track quote fetches
analytics.track('premium_quote_fetched', {
  model_used: quote.model_used,
  lite_premium: quote.plans.lite.weekly_premium,
  response_time: responseTime
});

// Track errors
analytics.track('premium_quote_error', {
  error_type: error.type,
  error_message: error.message
});
```

### Monitor Performance

```javascript
const startTime = Date.now();
const quote = await fetchPremiumQuote();
const responseTime = Date.now() - startTime;

console.log('Quote fetch time:', responseTime, 'ms');

// Alert if slow
if (responseTime > 2000) {
  console.warn('Slow quote fetch:', responseTime, 'ms');
}
```

## 🧪 Testing

### Unit Test Example

```javascript
import { calculateFallbackPremium } from '@/lib/premiumEngine';

test('calculates premium correctly', () => {
  const features = {
    worker_id: 'test',
    zone_id: 'zone_1',
    city_tier: 'tier_1',
    shift_start_hour: 9,
    shift_duration_hours: 8,
    declared_weekly_income_slab: 'medium',
    claim_count_last_4_weeks: 0,
    trust_score: 0.8,
    days_since_registration: 30,
    prior_zone_disruption_density: 0.1,
    disruption_probability: 0.1,
    week_of_year: 14,
    season_flag: 'summer'
  };
  
  const quote = calculateFallbackPremium(features);
  
  expect(quote.plans.lite.weekly_premium).toBeGreaterThan(0);
  expect(quote.plans.standard.weekly_premium).toBeGreaterThan(0);
  expect(quote.plans.premium.weekly_premium).toBeGreaterThan(0);
  expect(quote.model_used).toBe('fallback_rules');
});
```

## 🚀 Production Checklist

- [ ] Environment variables configured
- [ ] Firebase authentication working
- [ ] Worker profiles created in Firestore
- [ ] ML service URL configured
- [ ] Rate limiting tested
- [ ] Error handling implemented
- [ ] Caching implemented
- [ ] Loading states added
- [ ] Analytics tracking added
- [ ] Monitoring set up

## 📚 Additional Resources

- [Full API Documentation](./README.md)
- [Architecture Diagram](./ARCHITECTURE.md)
- [Test Examples](./test-example.ts)
- [Integration Tests](./__tests__/route.test.ts)

## 💡 Tips

1. **Always cache quotes** - Reduces API calls and improves UX
2. **Handle rate limits gracefully** - Show cached data when rate limited
3. **Show loading states** - Better user experience
4. **Log errors** - Helps with debugging
5. **Monitor performance** - Track response times
6. **Test fallback scenarios** - Ensure fallback works when ML fails

## 🆘 Need Help?

- Check the [full documentation](./README.md)
- Review [test examples](./test-example.ts)
- Check Firebase console for authentication issues
- Verify environment variables are set correctly
- Check browser console for errors
