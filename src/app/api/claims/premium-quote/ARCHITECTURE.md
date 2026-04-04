# Premium Quote API - Architecture

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Application                       │
│                    (React/Next.js Frontend)                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ POST /api/claims/premium-quote
                             │ Authorization: Bearer <token>
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Premium Quote API Route                       │
│                  (Next.js API Route on Vercel)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  [1] Authentication                                               │
│      ├─ Verify Firebase ID Token                                 │
│      └─ Extract Worker UID                                        │
│                                                                   │
│  [2] Rate Limiting                                                │
│      ├─ Check: 10 requests/hour per worker                       │
│      └─ Return 429 if exceeded                                    │
│                                                                   │
│  [3] Fetch Worker Profile                                         │
│      ├─ Query Firestore: workers/{workerId}                      │
│      └─ Extract: zone, city, shift, income, trust_score          │
│                                                                   │
│  [4] Fetch Disruption Forecast                                    │
│      ├─ GET {ML_SERVICE}/forecast/{zone_id}                      │
│      ├─ Timeout: 3 seconds                                        │
│      └─ Extract: disruption_probability                           │
│                                                                   │
│  [5] Build Feature Vector                                         │
│      ├─ Worker features (9)                                       │
│      ├─ Forecast features (1)                                     │
│      └─ Temporal features (3)                                     │
│                                                                   │
│  [6] Call ML Premium Engine                                       │
│      ├─ POST {ML_SERVICE}/premium/quote                          │
│      ├─ Timeout: 3 seconds                                        │
│      └─ On Success: Return ML quote                               │
│                                                                   │
│  [7] Fallback Chain (on ML failure)                               │
│      ├─ Try: Deterministic Fallback Engine                        │
│      │   ├─ Multiplier table lookup                               │
│      │   ├─ Calculate premiums                                    │
│      │   └─ Execution: < 50ms                                     │
│      │                                                             │
│      └─ Try: Floor Price (last resort)                            │
│          ├─ Lite: ₹19                                             │
│          ├─ Standard: ₹39                                         │
│          └─ Premium: ₹79                                          │
│                                                                   │
│  [8] Return Premium Quote                                         │
│      └─ JSON response with 3 plan options                         │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Component Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                         External Services                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─────────────────────┐         ┌─────────────────────┐        │
│  │   ML Microservice   │         │   Firebase Admin    │        │
│  │   (Render.com)      │         │   (Firestore)       │        │
│  ├─────────────────────┤         ├─────────────────────┤        │
│  │ /forecast/{zone}    │         │ workers collection  │        │
│  │ /premium/quote      │         │ Auth verification   │        │
│  └─────────────────────┘         └─────────────────────┘        │
│           ▲                                ▲                      │
└───────────┼────────────────────────────────┼──────────────────────┘
            │                                │
            │                                │
┌───────────┼────────────────────────────────┼──────────────────────┐
│           │         API Route              │                      │
├───────────┼────────────────────────────────┼──────────────────────┤
│           │                                │                      │
│  ┌────────┴────────────┐         ┌────────┴────────────┐        │
│  │  ML Service Client  │         │  Firebase Client    │        │
│  │  - Forecast fetch   │         │  - Auth verify      │        │
│  │  - Premium quote    │         │  - Profile fetch    │        │
│  │  - 3s timeout       │         │  - Rate limit check │        │
│  └─────────────────────┘         └─────────────────────┘        │
│           │                                                       │
│           │                                                       │
│           ▼                                                       │
│  ┌─────────────────────────────────────────────────┐            │
│  │         Premium Quote Orchestrator              │            │
│  │  - Feature vector builder                       │            │
│  │  - Fallback chain manager                       │            │
│  │  - Response formatter                           │            │
│  └─────────────────────────────────────────────────┘            │
│           │                                                       │
│           │                                                       │
│           ▼                                                       │
│  ┌─────────────────────────────────────────────────┐            │
│  │         Fallback Premium Engine                 │            │
│  │  (lib/premiumEngine.ts)                         │            │
│  │  - Multiplier table                             │            │
│  │  - Deterministic calculation                    │            │
│  │  - Floor price fallback                         │            │
│  └─────────────────────────────────────────────────┘            │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagram

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       │ 1. POST /api/claims/premium-quote
       │    Authorization: Bearer <token>
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│                      API Route Handler                        │
└──────┬───────────────────────────────────────────────────────┘
       │
       │ 2. Verify Token
       ▼
┌──────────────┐
│ Firebase Auth│──────► [Valid?] ──No──► 401 Unauthorized
└──────┬───────┘              │
       │                     Yes
       │ 3. Check Rate Limit  │
       ▼                      ▼
┌──────────────┐         ┌────────────┐
│ Rate Limiter │──────► [Exceeded?] ──Yes──► 429 Rate Limited
└──────┬───────┘              │
       │                      No
       │ 4. Fetch Profile     │
       ▼                      ▼
┌──────────────┐         ┌────────────┐
│  Firestore   │──────► [Exists?] ──No──► 404 Not Found
└──────┬───────┘              │
       │                     Yes
       │ 5. Fetch Forecast    │
       ▼                      ▼
┌──────────────┐         ┌────────────────────┐
│ ML Service   │──────► [Success?] ──No──► Use Default (0.1)
│  /forecast   │              │
└──────────────┘             Yes
       │                      │
       │ 6. Build Features    │
       ▼                      ▼
┌──────────────────────────────────────┐
│      Feature Vector (13 features)    │
└──────┬───────────────────────────────┘
       │
       │ 7. Call ML Premium Engine
       ▼
┌──────────────┐         ┌────────────────────┐
│ ML Service   │──────► [Success?] ──Yes──► Return ML Quote
│ /premium/quote│             │
└──────────────┘             No
       │                      │
       │ 8. Fallback Chain    │
       ▼                      ▼
┌──────────────────────────────────────┐
│    Deterministic Fallback Engine     │
│    - Multiplier table lookup         │
│    - Calculate premiums              │
└──────┬───────────────────────────────┘
       │
       │ [Success?] ──Yes──► Return Fallback Quote
       │      │
       │      No
       │      │
       ▼      ▼
┌──────────────────────────────────────┐
│         Floor Price Fallback         │
│         - Lite: ₹19                  │
│         - Standard: ₹39              │
│         - Premium: ₹79               │
└──────┬───────────────────────────────┘
       │
       │ 9. Return Quote
       ▼
┌──────────────┐
│   Client     │
└──────────────┘
```

## Fallback Decision Tree

```
                    ┌─────────────────┐
                    │  Call ML Service│
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   ML Success?   │
                    └────┬────────┬───┘
                        Yes      No
                         │        │
                         │        │
                    ┌────▼────┐   │
                    │ Return  │   │
                    │ML Quote │   │
                    └─────────┘   │
                                  │
                         ┌────────▼────────┐
                         │ Try Fallback    │
                         │ Engine          │
                         └────────┬────────┘
                                  │
                         ┌────────▼────────┐
                         │Fallback Success?│
                         └────┬────────┬───┘
                             Yes      No
                              │        │
                              │        │
                         ┌────▼────┐   │
                         │ Return  │   │
                         │Fallback │   │
                         │ Quote   │   │
                         └─────────┘   │
                                       │
                              ┌────────▼────────┐
                              │ Return Floor    │
                              │ Price Quote     │
                              └─────────────────┘
```

## Multiplier Table Structure

```
MULTIPLIER_TABLE
├── tier_1 (Mumbai, Delhi, Bangalore)
│   ├── low_risk (disruption < 0.15)
│   │   ├── morning (6-11): 1.0x
│   │   ├── afternoon (12-16): 1.1x
│   │   ├── evening (17-21): 1.2x
│   │   └── night (22-5): 1.3x
│   ├── medium_risk (0.15-0.3)
│   │   ├── morning: 1.3x
│   │   ├── afternoon: 1.4x
│   │   ├── evening: 1.5x
│   │   └── night: 1.6x
│   └── high_risk (≥ 0.3)
│       ├── morning: 1.6x
│       ├── afternoon: 1.7x
│       ├── evening: 1.8x
│       └── night: 2.0x
├── tier_2 (Pune, Hyderabad, Chennai)
│   └── ... (similar structure, lower multipliers)
└── tier_3 (Other cities)
    └── ... (similar structure, lowest multipliers)
```

## Feature Vector Composition

```
Feature Vector (13 features)
├── Worker Profile Features (9)
│   ├── city_tier (categorical)
│   ├── zone_id (categorical)
│   ├── shift_start_hour (numeric, 0-23)
│   ├── shift_duration_hours (numeric, 4-12)
│   ├── declared_weekly_income_slab (categorical)
│   ├── claim_count_last_4_weeks (numeric, 0-10)
│   ├── trust_score (numeric, 0-1)
│   ├── days_since_registration (numeric, 0-365+)
│   └── prior_zone_disruption_density (numeric, 0-1)
├── Forecast Features (1)
│   └── disruption_probability (numeric, 0-1)
└── Temporal Features (3)
    ├── week_of_year (numeric, 1-52)
    ├── season_flag (categorical: summer/monsoon/autumn/winter)
    └── shift_period (derived: morning/afternoon/evening/night)
```

## Response Structure

```
Premium Quote Response
├── request_id (string)
├── worker_id (string)
├── zone_id (string)
├── city_tier (string)
├── plans
│   ├── lite
│   │   ├── plan_name: "Lite"
│   │   ├── weekly_premium (number)
│   │   ├── max_weekly_protection: 500
│   │   ├── expected_payout (number)
│   │   └── roi_ratio (number)
│   ├── standard
│   │   ├── plan_name: "Standard"
│   │   ├── weekly_premium (number)
│   │   ├── max_weekly_protection: 1000
│   │   ├── expected_payout (number)
│   │   └── roi_ratio (number)
│   └── premium
│       ├── plan_name: "Premium"
│       ├── weekly_premium (number)
│       ├── max_weekly_protection: 2000
│       ├── expected_payout (number)
│       └── roi_ratio (number)
├── model_used (enum: ml_model | fallback_rules | floor_price)
├── timestamp (ISO 8601 string)
└── metadata (optional)
    ├── multiplier (number)
    ├── zone_risk_band (string)
    ├── shift_period (string)
    └── disruption_probability (number)
```

## Error Handling Flow

```
                    ┌─────────────────┐
                    │  API Request    │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Authentication  │
                    └────┬────────┬───┘
                        OK      Fail
                         │        │
                         │   ┌────▼────┐
                         │   │  401    │
                         │   │Unauthorized│
                         │   └─────────┘
                         │
                    ┌────▼────────┐
                    │Rate Limiting│
                    └────┬────────┬───┘
                        OK      Fail
                         │        │
                         │   ┌────▼────┐
                         │   │  429    │
                         │   │Rate Limit│
                         │   └─────────┘
                         │
                    ┌────▼────────┐
                    │Fetch Profile│
                    └────┬────────┬───┘
                        OK      Fail
                         │        │
                         │   ┌────▼────┐
                         │   │  404    │
                         │   │Not Found│
                         │   └─────────┘
                         │
                    ┌────▼────────┐
                    │ ML Service  │
                    └────┬────────┬───┘
                        OK      Fail
                         │        │
                         │   ┌────▼────────┐
                         │   │  Fallback   │
                         │   │  Engine     │
                         │   └────┬────────┘
                         │       OK│   Fail
                         │        │    │
                         │        │ ┌──▼──────┐
                         │        │ │  Floor  │
                         │        │ │  Price  │
                         │        │ └──┬──────┘
                         │        │    │
                    ┌────▼────────▼────▼───┐
                    │   200 OK with Quote  │
                    └──────────────────────┘
```

## Performance Characteristics

```
┌─────────────────────────────────────────────────────────┐
│                   Response Time                          │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ML Service Success:     ████████████ 500-1000ms        │
│  Fallback Engine:        █ < 50ms                        │
│  Floor Price:            ▌ < 1ms                         │
│                                                           │
├─────────────────────────────────────────────────────────┤
│                   Success Rate                           │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ML Service:             ███████████████████ 95%        │
│  Fallback Engine:        ████████████████████ 99.9%     │
│  Floor Price:            █████████████████████ 100%     │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

## Deployment Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Vercel Edge Network                    │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────────────────────────────────────────────┐   │
│  │         Next.js API Route (Serverless)           │   │
│  │  - Auto-scaling                                   │   │
│  │  - Global CDN                                     │   │
│  │  - Zero cold starts                               │   │
│  └──────────────────────────────────────────────────┘   │
│                                                            │
└──────────────────────────────────────────────────────────┘
                         │
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   Firebase   │  │ ML Service   │  │ Upstash Redis│
│   (Firestore)│  │ (Render.com) │  │(Rate Limiting)│
└──────────────┘  └──────────────┘  └──────────────┘
```
