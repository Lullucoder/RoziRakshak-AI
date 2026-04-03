# ML Microservice API - Technical Specification

## 1. Folder Structure

```
ml-service/
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI app entry point
│   ├── models/
│   │   ├── __init__.py
│   │   ├── premium.py             # Premium engine logic
│   │   ├── forecasting.py         # Disruption forecasting logic
│   │   ├── fraud.py               # Fraud detection logic
│   │   └── confidence.py          # Confidence scoring logic
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── requests.py            # Pydantic request models
│   │   └── responses.py           # Pydantic response models
│   ├── fallbacks/
│   │   ├── __init__.py
│   │   ├── premium_rules.py       # Deterministic premium fallback
│   │   ├── forecast_rules.py      # Rolling average fallback
│   │   ├── fraud_rules.py         # Hard-coded fraud rules
│   │   └── confidence_rules.py    # Binary check fallback
│   └── utils/
│       ├── __init__.py
│       ├── logger.py              # Logging configuration
│       └── validators.py          # Feature validation utilities
├── data/
│   ├── synthetic_riders.csv       # Generated rider data
│   ├── synthetic_disruptions.csv  # Generated disruption events
│   ├── synthetic_claims.csv       # Generated claim data
│   └── generation/
│       ├── __init__.py
│       ├── generate_riders.py     # Rider data generator
│       ├── generate_disruptions.py # Disruption data generator
│       ├── generate_claims.py     # Claim data generator
│       └── generate_outcomes.py   # Labelled outcomes generator
├── models/
│   ├── premium_v1.joblib          # Serialized XGBoost model
│   ├── premium_v1_metadata.json   # Model training metadata
│   ├── forecast_v1.joblib         # Serialized Prophet model
│   ├── forecast_v1_metadata.json
│   ├── fraud_v1.joblib            # Serialized Isolation Forest
│   ├── fraud_v1_metadata.json
│   ├── confidence_v1.joblib       # Serialized Logistic Regression
│   ├── confidence_v1_metadata.json
│   └── multiplier_table.json      # Fallback premium multipliers
├── training/
│   ├── __init__.py
│   ├── train_premium.py           # XGBoost training script
│   ├── train_forecast.py          # Prophet training script
│   ├── train_fraud.py             # Isolation Forest training script
│   └── train_confidence.py        # Logistic Regression training script
├── tests/
│   ├── __init__.py
│   ├── test_premium.py
│   ├── test_forecasting.py
│   ├── test_fraud.py
│   ├── test_confidence.py
│   └── test_fallbacks.py
├── .env.example
├── .gitignore
├── Dockerfile
├── requirements.txt
├── README.md
└── render.yaml                    # Render deployment config
```

---

## 2. API Endpoint Schemas

### 2.1 POST /premium/quote

**Request Schema:**
```json
{
  "request_id": "string (optional, generated if not provided)",
  "features": {
    "city_tier": "integer (1-3)",
    "zone_id": "string",
    "week_of_year": "integer (1-52)",
    "season_flag": "string (enum: summer, monsoon, winter, spring)",
    "forecasted_disruption_probability": "float (0.0-1.0)",
    "shift_start_hour": "integer (0-23)",
    "shift_duration_hours": "float (1.0-16.0)",
    "declared_weekly_income_slab": "integer (enum: 800, 1500, 2500)",
    "claim_count_last_4_weeks": "integer (0-20)",
    "trust_score": "float (0.0-1.0)",
    "days_since_registration": "integer (0-3650)",
    "prior_zone_disruption_density": "float (0.0-1.0)"
  }
}
```

**Response Schema (Success):**
```json
{
  "request_id": "string",
  "status": "success",
  "premium_rupees": "float",
  "risk_tier": "string (enum: Low, Medium, High)",
  "reasons": [
    "string (plain-language reason 1)",
    "string (plain-language reason 2)"
  ],
  "model_used": "string (enum: xgboost, fallback)",
  "timestamp": "string (ISO 8601)"
}
```

**Response Schema (Error):**
```json
{
  "request_id": "string",
  "status": "error",
  "error_code": "string",
  "error_message": "string",
  "timestamp": "string (ISO 8601)"
}
```

---

### 2.2 POST /forecast/disruption

**Request Schema:**
```json
{
  "request_id": "string (optional)",
  "city": "string",
  "zone_id": "string",
  "forecast_days": "integer (default: 7, max: 14)"
}
```

**Response Schema (Success):**
```json
{
  "request_id": "string",
  "status": "success",
  "city": "string",
  "zone_id": "string",
  "disruption_probability": "float (0.0-1.0)",
  "forecast_period_days": "integer",
  "confidence_interval": {
    "lower": "float",
    "upper": "float"
  },
  "model_used": "string (enum: prophet, rolling_average)",
  "historical_data_weeks": "integer",
  "timestamp": "string (ISO 8601)"
}
```

---

### 2.3 POST /fraud/score

**Request Schema:**
```json
{
  "request_id": "string (optional)",
  "claim_id": "string",
  "features": {
    "motion_variance": "float (0.0-100.0)",
    "network_type": "string (enum: wifi, cellular, unknown)",
    "rtt_ms": "float (0.0-5000.0)",
    "gps_accuracy_m": "float (0.0-500.0)",
    "distance_from_home_km": "float (0.0-100.0)",
    "route_continuity_score": "float (0.0-1.0)",
    "speed_between_pings_kmh": "float (0.0-150.0)",
    "claim_frequency_7d": "integer (0-20)",
    "days_since_registration": "integer (0-3650)",
    "payout_account_change_days": "integer (0-3650)",
    "simultaneous_claim_density_ratio": "float (0.0-50.0)",
    "shared_device_count": "integer (0-10)",
    "claim_timestamp_cluster_size": "integer (0-1000)",
    "emulator_flag": "boolean",
    "mock_location_flag": "boolean",
    "wifi_vs_cellular": "string (enum: wifi, cellular, mixed)",
    "gps_accuracy_stddev": "float (0.0-200.0)",
    "teleportation_flag": "boolean",
    "zone_entry_plausibility": "float (0.0-1.0)",
    "historical_zone_match": "boolean"
  }
}
```

**Response Schema (Success):**
```json
{
  "request_id": "string",
  "status": "success",
  "claim_id": "string",
  "anomaly_score": "float (0.0-1.0)",
  "risk_level": "string (enum: low, medium, high)",
  "top_contributing_features": [
    {
      "feature": "string",
      "contribution": "float",
      "reason": "string (plain-language)"
    }
  ],
  "model_used": "string (enum: isolation_forest, fallback_rules)",
  "fallback_rules_triggered": ["string (if fallback used)"],
  "timestamp": "string (ISO 8601)"
}
```

---

### 2.4 POST /confidence/score

**Request Schema:**
```json
{
  "request_id": "string (optional)",
  "claim_id": "string",
  "features": {
    "trigger_confirmed": "boolean",
    "zone_overlap_score": "float (0.0-1.0)",
    "emulator_flag": "boolean",
    "speed_plausible": "boolean",
    "duplicate_check_passed": "boolean",
    "fraud_anomaly_score": "float (0.0-1.0)",
    "historical_trust_score": "float (0.0-1.0)",
    "claim_frequency_7d": "integer (0-20)",
    "device_consistency_score": "float (0.0-1.0)"
  }
}
```

**Response Schema (Success):**
```json
{
  "request_id": "string",
  "status": "success",
  "claim_id": "string",
  "confidence_score": "float (0.0-1.0)",
  "decision_track": "string (enum: auto_approve, soft_review, hold)",
  "top_contributing_features": [
    {
      "feature": "string",
      "coefficient": "float",
      "reason": "string (plain-language)"
    }
  ],
  "model_used": "string (enum: logistic_regression, fallback_rules)",
  "fallback_checks": {
    "trigger_confirmed": "boolean",
    "zone_overlap": "boolean",
    "no_emulator": "boolean",
    "speed_plausible": "boolean",
    "no_duplicate": "boolean"
  },
  "timestamp": "string (ISO 8601)"
}
```

---

### 2.5 GET /health

**Response Schema:**
```json
{
  "status": "healthy",
  "service": "ml-microservice-api",
  "version": "1.0.0",
  "models": {
    "premium_engine": {
      "loaded": "boolean",
      "version": "string",
      "last_trained": "string (ISO 8601)"
    },
    "forecasting_engine": {
      "loaded": "boolean",
      "version": "string",
      "last_trained": "string (ISO 8601)"
    },
    "fraud_detector": {
      "loaded": "boolean",
      "version": "string",
      "last_trained": "string (ISO 8601)"
    },
    "confidence_scorer": {
      "loaded": "boolean",
      "version": "string",
      "last_trained": "string (ISO 8601)"
    }
  },
  "fallback_available": "boolean",
  "timestamp": "string (ISO 8601)"
}
```

---

## 3. Complete Feature Lists

### 3.1 Premium Engine (12 features)

| Feature | Type | Range/Values | Description |
|---------|------|--------------|-------------|
| `city_tier` | int | 1-3 | City classification (1=metro, 2=tier-2, 3=tier-3) |
| `zone_id` | string | - | Unique zone identifier |
| `week_of_year` | int | 1-52 | Week number for seasonality |
| `season_flag` | string | summer, monsoon, winter, spring | Current season |
| `forecasted_disruption_probability` | float | 0.0-1.0 | Predicted disruption likelihood |
| `shift_start_hour` | int | 0-23 | Typical shift start time |
| `shift_duration_hours` | float | 1.0-16.0 | Average shift length |
| `declared_weekly_income_slab` | int | 800, 1500, 2500 | Selected coverage tier |
| `claim_count_last_4_weeks` | int | 0-20 | Recent claim history |
| `trust_score` | float | 0.0-1.0 | Historical reliability score |
| `days_since_registration` | int | 0-3650 | Account age |
| `prior_zone_disruption_density` | float | 0.0-1.0 | Historical zone risk |

### 3.2 Forecasting Engine (input data)

| Feature | Type | Description |
|---------|------|-------------|
| `city` | string | City name |
| `zone_id` | string | Zone identifier |
| `historical_events` | array | List of past disruption timestamps and severities |
| `monsoon_onset_date` | string (ISO 8601) | Expected monsoon start |
| `diwali_date` | string (ISO 8601) | Diwali date for the year |

### 3.3 Fraud Detector (20 features)

| Feature | Type | Range/Values | Description |
|---------|------|--------------|-------------|
| `motion_variance` | float | 0.0-100.0 | Accelerometer variance over 30s |
| `network_type` | string | wifi, cellular, unknown | Connection type |
| `rtt_ms` | float | 0.0-5000.0 | Network round-trip time |
| `gps_accuracy_m` | float | 0.0-500.0 | GPS accuracy radius |
| `distance_from_home_km` | float | 0.0-100.0 | Distance from registered home |
| `route_continuity_score` | float | 0.0-1.0 | Path plausibility |
| `speed_between_pings_kmh` | float | 0.0-150.0 | Movement speed |
| `claim_frequency_7d` | int | 0-20 | Claims in last 7 days |
| `days_since_registration` | int | 0-3650 | Account age |
| `payout_account_change_days` | int | 0-3650 | Days since UPI change |
| `simultaneous_claim_density_ratio` | float | 0.0-50.0 | Zone claim density vs normal |
| `shared_device_count` | int | 0-10 | Accounts sharing device fingerprint |
| `claim_timestamp_cluster_size` | int | 0-1000 | Claims in 3-minute window |
| `emulator_flag` | boolean | true/false | Emulator detection |
| `mock_location_flag` | boolean | true/false | Mock GPS detection |
| `wifi_vs_cellular` | string | wifi, cellular, mixed | Network pattern |
| `gps_accuracy_stddev` | float | 0.0-200.0 | GPS accuracy variation |
| `teleportation_flag` | boolean | true/false | Impossible movement detected |
| `zone_entry_plausibility` | float | 0.0-1.0 | Entry path likelihood |
| `historical_zone_match` | boolean | true/false | Matches typical zones |

### 3.4 Confidence Scorer (9 features)

| Feature | Type | Range/Values | Description |
|---------|------|--------------|-------------|
| `trigger_confirmed` | boolean | true/false | External trigger validated |
| `zone_overlap_score` | float | 0.0-1.0 | Worker-trigger zone match |
| `emulator_flag` | boolean | true/false | Emulator detected |
| `speed_plausible` | boolean | true/false | Movement speed realistic |
| `duplicate_check_passed` | boolean | true/false | No duplicate claim |
| `fraud_anomaly_score` | float | 0.0-1.0 | Output from fraud detector |
| `historical_trust_score` | float | 0.0-1.0 | Long-term reliability |
| `claim_frequency_7d` | int | 0-20 | Recent claim count |
| `device_consistency_score` | float | 0.0-1.0 | Device fingerprint stability |

---

## 4. Synthetic Data Generation Plan

### 4.1 Premium Training Data (1000 records)

**Generation Strategy:**
- City tier distribution: 40% tier-1, 35% tier-2, 25% tier-3
- Zone IDs: 50 unique zones across 10 cities
- Week of year: uniform distribution 1-52
- Season flag: aligned with week_of_year (monsoon weeks 24-38)
- Forecasted disruption: higher during monsoon (0.3-0.7), lower otherwise (0.05-0.2)
- Shift patterns: 60% morning (6-14), 30% afternoon (14-22), 10% night (22-6)
- Income slabs: 30% lite (800), 50% core (1500), 20% peak (2500)
- Trust score: beta distribution (α=5, β=2) to skew toward higher trust
- Days since registration: exponential distribution (λ=0.003) for realistic retention curve
- Target premium: calculated using realistic formula with noise

**Output:** `data/synthetic_riders.csv`

### 4.2 Disruption Forecasting Data (6 months × 50 zones)

**Generation Strategy:**
- 50 zones across 10 cities
- Daily disruption events for 180 days
- Monsoon seasonality: sine wave with peak in July-August
- Weekly pattern: higher disruptions on weekends
- Monsoon onset regressor: sharp increase starting week 24
- Diwali regressor: spike in week 43
- Random noise: 15% to simulate real-world variance
- Event severity: 0 (no disruption) to 1 (severe)

**Output:** `data/synthetic_disruptions.csv`

### 4.3 Fraud Detection Training Data (500 records)

**Generation Strategy:**
- 450 normal claims (90%):
  - Motion variance: 5-40 (realistic field activity)
  - Network: 70% cellular, 30% wifi
  - GPS accuracy: 10-50m with realistic stddev
  - Speed: 5-35 km/h
  - Distance from home: 2-15 km
  - No emulator/mock flags
  - Route continuity: 0.7-1.0
  
- 50 anomalous claims (10%):
  - Type A (GPS spoofing): motion_variance < 2, wifi at home, perfect GPS accuracy
  - Type B (Speed violation): speed > 80 km/h, teleportation_flag = true
  - Type C (Emulator): emulator_flag = true, mock_location_flag = true
  - Type D (Claim rings): simultaneous_claim_density_ratio > 10, shared_device_count > 2
  - Type E (Frequency abuse): claim_frequency_7d > 5

**Output:** `data/synthetic_claims.csv`

### 4.4 Confidence Scoring Training Data (300 records)

**Generation Strategy:**
- 200 auto-approve cases (confidence > 0.75):
  - All checks passed
  - Fraud score < 0.3
  - High trust score (> 0.7)
  
- 70 soft-review cases (confidence 0.40-0.75):
  - Mixed signals (some checks failed)
  - Moderate fraud score (0.3-0.6)
  - Medium trust score (0.4-0.7)
  
- 30 hold cases (confidence < 0.40):
  - Multiple checks failed
  - High fraud score (> 0.6)
  - Low trust score (< 0.4)

**Output:** `data/synthetic_outcomes.csv`

---

## 5. Fallback Behavior Specifications

### 5.1 Premium Engine Fallback

**Trigger:** XGBoost model fails to load or execute

**Fallback Logic:**
```
premium = base_amount × city_multiplier × zone_risk_multiplier × shift_multiplier
```

**Multiplier Table (JSON):**
```json
{
  "city_tier": {
    "1": 1.3,
    "2": 1.1,
    "3": 1.0
  },
  "zone_risk_band": {
    "low": 1.0,
    "medium": 1.2,
    "high": 1.5
  },
  "shift_period": {
    "morning": 1.0,
    "afternoon": 1.3,
    "night": 1.1
  },
  "base_amounts": {
    "800": 19,
    "1500": 35,
    "2500": 55
  }
}
```

**Risk Tier Assignment:**
- Low: final premium < 30
- Medium: 30 ≤ premium < 50
- High: premium ≥ 50

**Reasons Returned:**
- "City tier {tier} applied"
- "Zone classified as {risk_band} risk"

---

### 5.2 Forecasting Engine Fallback

**Trigger:** Prophet model fails OR zone has < 8 weeks of history

**Fallback Logic:**
```
disruption_probability = sum(disruptions_last_4_weeks) / (4 × 7)
```

**Behavior:**
- Query Firestore `triggerEvents` collection for last 28 days
- Count disruption events in the target zone
- Divide by 28 to get daily probability
- Return with `model_used: "rolling_average"`

---

### 5.3 Fraud Detector Fallback

**Trigger:** Isolation Forest model fails to load or execute

**Fallback Rules (any rule triggers score = 1.0):**
1. `speed_between_pings_kmh > 80` → "Impossible speed detected"
2. `emulator_flag == true` → "Emulator detected"
3. `claim_frequency_7d > 3` → "Excessive claim frequency"

**Behavior:**
- Check all three rules sequentially
- Return first violated rule in `fallback_rules_triggered` array
- If no rules violated, return score = 0.1 (low risk)
- Risk level: score ≥ 0.7 → high, 0.3-0.7 → medium, < 0.3 → low

---

### 5.4 Confidence Scorer Fallback

**Trigger:** Logistic Regression model fails to load or execute

**Fallback Checks (5 binary checks, each worth 0.2):**
1. `trigger_confirmed == true` → +0.2
2. `zone_overlap_score > 0.5` → +0.2
3. `emulator_flag == false` → +0.2
4. `speed_plausible == true` → +0.2
5. `duplicate_check_passed == true` → +0.2

**Behavior:**
- Sum all passed checks
- Return score (0.0-1.0)
- Decision track: ≥ 0.75 → auto_approve, 0.40-0.75 → soft_review, < 0.40 → hold
- Return which checks passed/failed in `fallback_checks` object

---

## 6. Error Handling and Status Codes

| HTTP Code | Scenario | Response |
|-----------|----------|----------|
| 200 | Success | Full response with data |
| 400 | Invalid request (missing/invalid features) | Error with field details |
| 422 | Validation error (Pydantic) | Field-level error messages |
| 500 | Model execution error (fallback used) | Success response with `model_used: "fallback"` |
| 503 | Service unavailable (startup) | "Models still loading" |

---

## 7. Environment Variables

```bash
# Service Configuration
PORT=8000
LOG_LEVEL=INFO
ENVIRONMENT=production

# Model Paths
MODELS_DIR=./models
DATA_DIR=./data

# CORS Configuration
ALLOWED_ORIGINS=https://your-firebase-project.cloudfunctions.net,http://localhost:3000

# Model Versions (optional, defaults to latest)
PREMIUM_MODEL_VERSION=v1
FORECAST_MODEL_VERSION=v1
FRAUD_MODEL_VERSION=v1
CONFIDENCE_MODEL_VERSION=v1
```

---

## 8. Deployment Configuration (render.yaml)

```yaml
services:
  - type: web
    name: ml-microservice-api
    env: python
    region: singapore
    plan: free
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: PYTHON_VERSION
        value: 3.11.0
      - key: LOG_LEVEL
        value: INFO
      - key: ENVIRONMENT
        value: production
```

---

## 9. Dependencies (requirements.txt)

```
fastapi==0.109.0
uvicorn[standard]==0.27.0
pydantic==2.5.3
scikit-learn==1.4.0
xgboost==2.0.3
prophet==1.1.5
pandas==2.2.0
numpy==1.26.3
joblib==1.3.2
python-dotenv==1.0.0
```

---

This technical specification provides all the details needed to implement the ML microservice without writing any code yet. Please review and confirm before proceeding to implementation.
