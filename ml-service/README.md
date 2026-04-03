# RoziRakshak AI - ML Microservice

Standalone Python FastAPI microservice providing AI-powered pricing, forecasting, fraud detection, and confidence scoring for the RoziRakshak parametric insurance platform.

## Architecture

This service exposes 4 HTTP endpoints:
- `POST /premium/quote` - Personalized weekly premium calculation (XGBoost)
- `POST /forecast/disruption` - Next-week disruption probability (Prophet)
- `POST /fraud/score` - Claim fraud risk scoring (Isolation Forest)
- `POST /confidence/score` - Claim approval confidence (Logistic Regression)

Each endpoint has a deterministic fallback if the ML model fails to load.

## Local Development

### Prerequisites
- Python 3.11+
- pip

### Setup

1. **Create virtual environment:**
```bash
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

2. **Install dependencies:**
```bash
pip install -r requirements.txt
```

3. **Configure environment:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Generate synthetic training data:**
```bash
python synthetic_data.py
```

This creates:
- `data/synthetic_riders.csv` (1000 records)
- `data/synthetic_disruptions.csv` (9000 events)
- `data/synthetic_claims.csv` (500 records)
- `data/synthetic_outcomes.csv` (300 records)

5. **Train models (TODO - not yet implemented):**
```bash
# These scripts will be created in the next phase
python training/train_premium.py
python training/train_forecast.py
python training/train_fraud.py
python training/train_confidence.py
```

6. **Run the server:**
```bash
python main.py
```

Server starts at `http://localhost:8000`

### API Documentation

Once running, visit:
- Interactive docs: `http://localhost:8000/docs`
- Health check: `http://localhost:8000/health`

## Testing Endpoints

### Premium Quote
```bash
curl -X POST http://localhost:8000/premium/quote \
  -H "Content-Type: application/json" \
  -d '{
    "features": {
      "city_tier": 1,
      "zone_id": "zone_001",
      "week_of_year": 30,
      "season_flag": "monsoon",
      "forecasted_disruption_probability": 0.45,
      "shift_start_hour": 8,
      "shift_duration_hours": 8.5,
      "declared_weekly_income_slab": 1500,
      "claim_count_last_4_weeks": 1,
      "trust_score": 0.85,
      "days_since_registration": 180,
      "prior_zone_disruption_density": 0.35
    }
  }'
```

### Disruption Forecast
```bash
curl -X POST http://localhost:8000/forecast/disruption \
  -H "Content-Type: application/json" \
  -d '{
    "city": "Bengaluru",
    "zone_id": "zone_001",
    "forecast_days": 7
  }'
```

### Fraud Score
```bash
curl -X POST http://localhost:8000/fraud/score \
  -H "Content-Type: application/json" \
  -d '{
    "claim_id": "claim_12345",
    "features": {
      "motion_variance": 25.5,
      "network_type": "cellular",
      "rtt_ms": 120.0,
      "gps_accuracy_m": 15.0,
      "distance_from_home_km": 8.5,
      "route_continuity_score": 0.85,
      "speed_between_pings_kmh": 22.0,
      "claim_frequency_7d": 1,
      "days_since_registration": 180,
      "payout_account_change_days": 180,
      "simultaneous_claim_density_ratio": 1.2,
      "shared_device_count": 1,
      "claim_timestamp_cluster_size": 3,
      "emulator_flag": false,
      "mock_location_flag": false,
      "wifi_vs_cellular": "cellular",
      "gps_accuracy_stddev": 8.5,
      "teleportation_flag": false,
      "zone_entry_plausibility": 0.9,
      "historical_zone_match": true
    }
  }'
```

### Confidence Score
```bash
curl -X POST http://localhost:8000/confidence/score \
  -H "Content-Type: application/json" \
  -d '{
    "claim_id": "claim_12345",
    "features": {
      "trigger_confirmed": true,
      "zone_overlap_score": 0.85,
      "emulator_flag": false,
      "speed_plausible": true,
      "duplicate_check_passed": true,
      "fraud_anomaly_score": 0.15,
      "historical_trust_score": 0.85,
      "claim_frequency_7d": 1,
      "device_consistency_score": 0.9
    }
  }'
```

## Deployment to Render

### Prerequisites
- Render account (free tier available)
- GitHub repository with this code

### Steps

1. **Push code to GitHub:**
```bash
git add ml-service/
git commit -m "Add ML microservice"
git push origin main
```

2. **Create new Web Service on Render:**
   - Go to https://dashboard.render.com
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Name:** `rozirakshak-ml-service`
     - **Region:** Singapore (or closest to your Firebase region)
     - **Branch:** `main`
     - **Root Directory:** `ml-service`
     - **Runtime:** Python 3
     - **Build Command:** `pip install -r requirements.txt`
     - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`

3. **Set environment variables in Render dashboard:**
   - `ENVIRONMENT=production`
   - `LOG_LEVEL=INFO`
   - `ALLOWED_ORIGINS=https://your-firebase-project.cloudfunctions.net`

4. **Deploy:**
   - Render will automatically build and deploy
   - Service URL will be: `https://rozirakshak-ml-service.onrender.com`

5. **Update Firebase Cloud Functions:**
   - Set the ML service URL in your Firebase Functions environment:
   ```bash
   firebase functions:config:set ml.service_url="https://rozirakshak-ml-service.onrender.com"
   ```

### Cold Start Handling

Render free tier spins down after 15 minutes of inactivity. First request after spin-down takes ~30 seconds.

**Mitigation strategies:**
1. Models load at startup (not per-request)
2. Fallback logic ensures service never fails
3. Consider upgrading to paid tier for production (no cold starts)

## Project Structure

```
ml-service/
├── main.py                  # FastAPI app, routes, startup logic
├── premium_engine.py        # Module 1: Premium calculation
├── forecasting.py           # Module 2: Disruption forecasting
├── fraud_detector.py        # Module 3: Fraud detection
├── confidence_scorer.py     # Module 4: Confidence scoring
├── synthetic_data.py        # Data generation for all models
├── models/                  # Serialized .joblib files (gitignored)
├── data/                    # Generated CSV files (gitignored)
├── requirements.txt         # Python dependencies
├── Dockerfile               # Container configuration
├── .env.example             # Environment variable template
└── README.md                # This file
```

## Model Training (Next Phase)

Training scripts will be added in `training/` directory:
- `train_premium.py` - Train XGBoost on synthetic_riders.csv
- `train_forecast.py` - Train Prophet on synthetic_disruptions.csv
- `train_fraud.py` - Train Isolation Forest on synthetic_claims.csv
- `train_confidence.py` - Train Logistic Regression on synthetic_outcomes.csv

Each script will:
1. Load synthetic data from `data/`
2. Train the model
3. Serialize to `models/` using Joblib
4. Save metadata (version, training date, metrics) as JSON

## Fallback Behavior

All endpoints gracefully degrade to deterministic rules if models fail:

| Endpoint | Fallback Logic |
|----------|---------------|
| Premium | Multiplier table (city × zone × shift) |
| Forecast | 4-week rolling average |
| Fraud | Hard rules (speed > 80 km/h, emulator, frequency) |
| Confidence | Weighted binary checks (5 × 0.2) |

## Integration with Firebase

Firebase Cloud Functions call this service via HTTP:

```javascript
// Example Firebase Function
const ML_SERVICE_URL = functions.config().ml.service_url;

exports.calculatePremium = functions.https.onCall(async (data, context) => {
  const response = await fetch(`${ML_SERVICE_URL}/premium/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ features: data })
  });
  return await response.json();
});
```

## Monitoring

- Health check: `GET /health` returns model load status
- All requests logged with feature vector summaries
- Fallback usage tracked in logs

## Security

- CORS restricted to Firebase Cloud Functions domain
- No authentication required (internal service, not public)
- Input validation via Pydantic models
- Rate limiting should be handled at Firebase level

## License

Part of RoziRakshak AI project for DEVTrails 2026 hackathon.
