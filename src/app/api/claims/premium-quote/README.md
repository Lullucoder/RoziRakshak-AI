# Premium Quote API

## Endpoint

```
POST /api/claims/premium-quote
```

## Description

Generates personalized premium quotes for workers based on their profile, zone risk, and ML-powered disruption forecasts. The endpoint implements a robust fallback chain to ensure 100% availability.

## Authentication

Requires Firebase ID token in Authorization header:

```
Authorization: Bearer <firebase_id_token>
```

## Rate Limiting

- **Limit**: 10 requests per worker per hour
- **Response**: 429 Too Many Requests with `retry_after` field

## Request

No request body required. Worker information is extracted from the authenticated token and Firestore profile.

## Response

### Success (200 OK)

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
    "standard": {
      "plan_name": "Standard",
      "weekly_premium": 52,
      "max_weekly_protection": 1000,
      "expected_payout": 100,
      "roi_ratio": 1.92
    },
    "premium": {
      "plan_name": "Premium",
      "weekly_premium": 105,
      "max_weekly_protection": 2000,
      "expected_payout": 200,
      "roi_ratio": 1.90
    }
  },
  "model_used": "ml_model",
  "timestamp": "2026-04-04T19:45:00.000Z",
  "metadata": {
    "multiplier": 1.3,
    "zone_risk_band": "medium_risk",
    "shift_period": "morning",
    "disruption_probability": 0.1
  }
}
```

### Error Responses

#### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Missing or invalid authorization header"
}
```

#### 404 Not Found
```json
{
  "error": "Worker not found",
  "message": "Worker profile does not exist"
}
```

#### 429 Too Many Requests
```json
{
  "error": "Rate limit exceeded",
  "message": "Maximum 10 quote requests per hour",
  "retry_after": 3456
}
```

## Fallback Chain

The endpoint implements a 3-tier fallback strategy to ensure 100% availability:

### 1. ML Service (Primary)
- **Endpoint**: `POST {RENDER_ML_URL}/premium/quote`
- **Timeout**: 3 seconds
- **Model**: Gradient Boosting Regressor trained on historical data
- **Accuracy**: Highest (personalized pricing)

### 2. Deterministic Fallback (Secondary)
- **Implementation**: `lib/premiumEngine.ts`
- **Execution Time**: < 50ms
- **Model**: Multiplier table (city_tier × zone_risk × shift_period)
- **Accuracy**: Good (rule-based pricing)

### 3. Floor Price (Last Resort)
- **Lite**: ₹19
- **Standard**: ₹39
- **Premium**: ₹79
- **Use Case**: When both ML and fallback fail

## Feature Vector

The API builds a comprehensive feature vector from:

### Worker Profile (Firestore)
- `city_tier`: Derived from city name (tier_1, tier_2, tier_3)
- `zone_id`: Worker's assigned zone
- `shift_start_hour`: Shift start time (0-23)
- `shift_duration_hours`: Shift length in hours
- `declared_weekly_income_slab`: Income bracket
- `claim_count_last_4_weeks`: Recent claim history
- `trust_score`: Behavioral trust metric (0-1)
- `days_since_registration`: Account age
- `prior_zone_disruption_density`: Historical zone risk

### Disruption Forecast (ML Service)
- **Endpoint**: `GET {RENDER_ML_URL}/forecast/{zone_id}`
- **Field**: `next_week_summary.average_disruption_probability`
- **Timeout**: 3 seconds
- **Fallback**: 0.1 (10% default probability)

### Temporal Features
- `week_of_year`: Current week (1-52)
- `season_flag`: Current season (summer, monsoon, autumn, winter)

## Multiplier Table

The fallback engine uses this multiplier table:

| City Tier | Risk Band | Morning | Afternoon | Evening | Night |
|-----------|-----------|---------|-----------|---------|-------|
| Tier 1    | Low       | 1.0     | 1.1       | 1.2     | 1.3   |
| Tier 1    | Medium    | 1.3     | 1.4       | 1.5     | 1.6   |
| Tier 1    | High      | 1.6     | 1.7       | 1.8     | 2.0   |
| Tier 2    | Low       | 0.9     | 1.0       | 1.1     | 1.2   |
| Tier 2    | Medium    | 1.2     | 1.3       | 1.4     | 1.5   |
| Tier 2    | High      | 1.5     | 1.6       | 1.7     | 1.9   |
| Tier 3    | Low       | 0.8     | 0.9       | 1.0     | 1.1   |
| Tier 3    | Medium    | 1.1     | 1.2       | 1.3     | 1.4   |
| Tier 3    | High      | 1.4     | 1.5       | 1.6     | 1.8   |

**Risk Band Calculation**:
- High Risk: disruption_probability ≥ 0.3
- Medium Risk: 0.15 ≤ disruption_probability < 0.3
- Low Risk: disruption_probability < 0.15

**Shift Period Calculation**:
- Morning: 6:00 - 11:59
- Afternoon: 12:00 - 16:59
- Evening: 17:00 - 21:59
- Night: 22:00 - 5:59

## Example Usage

### JavaScript/TypeScript

```typescript
const response = await fetch('/api/claims/premium-quote', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${firebaseIdToken}`,
    'Content-Type': 'application/json'
  }
});

const quote = await response.json();

console.log('Lite Plan:', quote.plans.lite.weekly_premium);
console.log('Standard Plan:', quote.plans.standard.weekly_premium);
console.log('Premium Plan:', quote.plans.premium.weekly_premium);
console.log('Model Used:', quote.model_used);
```

### cURL

```bash
curl -X POST https://your-domain.com/api/claims/premium-quote \
  -H "Authorization: Bearer YOUR_FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json"
```

## Performance

- **ML Service**: ~500-1000ms (network + inference)
- **Fallback Engine**: < 50ms (in-memory calculation)
- **Floor Price**: < 1ms (static values)

## Monitoring

The endpoint logs all operations:

```
[Premium Quote] Request from worker: worker_uid_123
[Premium Quote] Worker profile loaded: { workerId, zone, city }
[Premium Quote] Forecast fetched: { zoneId, disruptionProbability }
[Premium Quote] Feature vector built: { ... }
[Premium Quote] ML service response received
[Premium Quote] Returning quote: { workerId, modelUsed, litePremium }
```

## Error Handling

The endpoint **never returns 500 Internal Server Error**. All errors are handled gracefully:

1. ML service timeout → Fallback engine
2. Fallback engine error → Floor price
3. Floor price error → 503 Service Unavailable (extremely rare)

## Security

- ✅ Firebase authentication required
- ✅ Rate limiting (10 requests/hour per worker)
- ✅ Worker can only request quotes for themselves
- ✅ No sensitive data in logs
- ✅ CORS headers configured for web clients

## Future Enhancements

- [ ] Replace in-memory rate limiting with Upstash Redis
- [ ] Add quote caching (5-minute TTL)
- [ ] Implement A/B testing for pricing strategies
- [ ] Add quote comparison analytics
- [ ] Support for custom coverage amounts
