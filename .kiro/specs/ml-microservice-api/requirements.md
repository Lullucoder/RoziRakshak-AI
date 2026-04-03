# Requirements Document

## Introduction

This document specifies the requirements for a standalone Python ML microservice that provides AI-powered pricing, forecasting, fraud detection, and claim confidence scoring for the RoziRakshak AI platform. The service is a FastAPI-based HTTP server that exposes 4 endpoints, gets called by Firebase Cloud Functions, and runs independently from the Next.js frontend application.

## Glossary

- **ML_Service**: The standalone Python FastAPI microservice that hosts all four AI models
- **Premium_Engine**: XGBoost-based model that calculates personalized weekly insurance premiums
- **Forecasting_Engine**: Prophet-based model that predicts next-week disruption probability per city-zone
- **Fraud_Detector**: Isolation Forest model that scores claims for suspicious patterns
- **Confidence_Scorer**: Logistic Regression model that produces claim approval confidence scores
- **Feature_Vector**: The structured input data required by each model
- **Fallback_Logic**: Deterministic rule-based computation used when a model fails or is unavailable
- **Firebase_Function**: Google Cloud Function that calls the ML_Service via HTTP
- **Render**: Cloud platform hosting the ML_Service (free tier with cold starts)
- **Joblib**: Python library for model serialization and deserialization

## Requirements

### Requirement 1: Premium Calculation Endpoint

**User Story:** As a Firebase Cloud Function, I want to request a personalized weekly premium for a rider, so that I can present accurate pricing during policy purchase.

#### Acceptance Criteria

1. WHEN a POST request is sent to `/premium/quote` with a valid 12-feature vector, THE Premium_Engine SHALL return a personalized weekly premium in rupees within 2 seconds
2. THE Premium_Engine SHALL return a risk tier classification (Low, Medium, or High) alongside the premium amount
3. THE Premium_Engine SHALL return the top 2 plain-language reasons explaining the premium calculation
4. THE Premium_Engine SHALL use an XGBoost Regressor trained on synthetic rider data
5. IF the XGBoost model fails to load or execute, THEN THE Premium_Engine SHALL fall back to a deterministic multiplier table using city_tier × zone_risk_band × shift_period
6. THE Premium_Engine SHALL validate that all 12 required features are present before processing
7. WHEN required features are missing or invalid, THE Premium_Engine SHALL return a 400 error with a descriptive message
8. THE Premium_Engine SHALL serialize the trained XGBoost model using Joblib for fast loading at service startup

### Requirement 2: Disruption Forecasting Endpoint

**User Story:** As a scheduled Firebase Cloud Function, I want to predict next-week disruption probability for all city-zones, so that I can adjust premiums and alert high-risk riders proactively.

#### Acceptance Criteria

1. WHEN a POST request is sent to `/forecast/disruption` with city and zone identifiers, THE Forecasting_Engine SHALL return a disruption probability score between 0 and 1 for the next 7 days
2. THE Forecasting_Engine SHALL use Facebook Prophet to model weekly seasonality and Indian monsoon patterns
3. THE Forecasting_Engine SHALL accept Diwali and monsoon onset dates as named regressors
4. THE Forecasting_Engine SHALL train on at least 6 months of synthetic historical disruption data per zone
5. IF a zone has fewer than 8 weeks of historical data, THEN THE Forecasting_Engine SHALL fall back to a 4-week rolling average disruption frequency
6. IF the Prophet model fails to execute, THEN THE Forecasting_Engine SHALL fall back to the 4-week rolling average for all zones
7. THE Forecasting_Engine SHALL return forecast results within 5 seconds for a single zone
8. THE Forecasting_Engine SHALL serialize trained Prophet models per zone using Joblib

### Requirement 3: Fraud Detection Endpoint

**User Story:** As a claims processing Firebase Cloud Function, I want to score a claim for fraud risk, so that I can route suspicious claims to manual review and auto-approve clean claims.

#### Acceptance Criteria

1. WHEN a POST request is sent to `/fraud/score` with a 20-feature vector, THE Fraud_Detector SHALL return an anomaly score between 0 and 1 within 1 second
2. THE Fraud_Detector SHALL use an Isolation Forest model with contamination=0.05 and n_estimators=100
3. THE Fraud_Detector SHALL classify scores above 0.7 as high-risk anomalies
4. THE Fraud_Detector SHALL return the top 3 features contributing to the anomaly score
5. IF the Isolation Forest model fails to execute, THEN THE Fraud_Detector SHALL fall back to hard-coded rules: speed > 80 km/h OR emulator flag OR > 3 claims in 7 days results in a score of 1.0
6. THE Fraud_Detector SHALL validate that all 20 required features are present before processing
7. WHEN the fallback rule engine is triggered, THE Fraud_Detector SHALL return which specific rule was violated
8. THE Fraud_Detector SHALL train on synthetic data with 90% normal claims and 10% injected anomalies

### Requirement 4: Claim Confidence Scoring Endpoint

**User Story:** As a claims processing Firebase Cloud Function, I want to calculate a confidence score for claim approval, so that I can auto-approve high-confidence claims and route borderline claims to review.

#### Acceptance Criteria

1. WHEN a POST request is sent to `/confidence/score` with a 9-feature combined vector, THE Confidence_Scorer SHALL return a calibrated probability score between 0 and 1 within 500ms
2. THE Confidence_Scorer SHALL use Logistic Regression trained on synthetic labelled claim outcomes
3. THE Confidence_Scorer SHALL classify scores above 0.75 as auto-approve, scores between 0.40 and 0.75 as soft review, and scores below 0.40 as hold
4. THE Confidence_Scorer SHALL return the top 2 features contributing to the confidence score
5. IF the Logistic Regression model fails to execute, THEN THE Confidence_Scorer SHALL fall back to a weighted rule score using 5 binary checks (trigger confirmed, zone overlap, no emulator, speed plausible, no duplicate) each worth 0.2
6. THE Confidence_Scorer SHALL produce well-calibrated probabilities where a score of 0.75 indicates genuine 75% confidence
7. THE Confidence_Scorer SHALL validate that all 9 required features are present before processing
8. WHEN the fallback rule engine is triggered, THE Confidence_Scorer SHALL return which specific checks passed or failed

### Requirement 5: Service Health and Monitoring

**User Story:** As a Firebase Cloud Function, I want to check if the ML_Service is healthy and ready, so that I can route requests appropriately and handle service unavailability gracefully.

#### Acceptance Criteria

1. THE ML_Service SHALL expose a GET `/health` endpoint that returns 200 OK when all models are loaded
2. THE ML_Service SHALL return model load status for each of the 4 models in the health check response
3. WHEN any model fails to load at startup, THE ML_Service SHALL log the error but continue serving requests using fallback logic
4. THE ML_Service SHALL load all serialized models from disk at startup before accepting HTTP requests
5. THE ML_Service SHALL run on Uvicorn ASGI server with Python 3.11
6. THE ML_Service SHALL handle cold starts on Render free tier by loading models within 30 seconds
7. THE ML_Service SHALL log all incoming requests with feature vector summaries for debugging
8. THE ML_Service SHALL return structured JSON error responses with appropriate HTTP status codes for all failure cases

### Requirement 6: Request and Response Schema Validation

**User Story:** As a developer integrating with the ML_Service, I want clear request and response schemas, so that I can construct valid API calls and parse responses correctly.

#### Acceptance Criteria

1. THE ML_Service SHALL validate all incoming request bodies against Pydantic models
2. WHEN request validation fails, THE ML_Service SHALL return a 422 error with detailed field-level error messages
3. THE ML_Service SHALL document all request and response schemas using FastAPI's automatic OpenAPI generation
4. THE ML_Service SHALL expose interactive API documentation at `/docs` using Swagger UI
5. THE ML_Service SHALL accept and return all data in JSON format with UTF-8 encoding
6. THE ML_Service SHALL include request_id in all responses for tracing and debugging
7. THE ML_Service SHALL return consistent error response structure across all endpoints

### Requirement 7: Model Training and Synthetic Data Generation

**User Story:** As a developer building the ML_Service, I want to generate synthetic training data for all models, so that I can train and validate models without real production data.

#### Acceptance Criteria

1. THE ML_Service SHALL include a data generation script that produces at least 1000 synthetic rider records for premium training
2. THE ML_Service SHALL include a data generation script that produces 6 months of synthetic disruption events per zone for forecasting training
3. THE ML_Service SHALL include a data generation script that produces at least 500 synthetic claims (90% normal, 10% anomalous) for fraud detection training
4. THE ML_Service SHALL include a data generation script that produces at least 300 synthetic labelled claim outcomes for confidence scoring training
5. THE ML_Service SHALL generate synthetic data with realistic distributions matching Indian gig-worker patterns
6. THE ML_Service SHALL include monsoon seasonality patterns in disruption data generation
7. THE ML_Service SHALL inject known anomaly patterns (GPS spoofing, speed violations, emulator flags) into fraud training data
8. THE ML_Service SHALL save all generated synthetic data as CSV files in a `data/` directory

### Requirement 8: Model Serialization and Versioning

**User Story:** As a developer deploying the ML_Service, I want trained models to be serialized and versioned, so that I can deploy consistent model versions and roll back if needed.

#### Acceptance Criteria

1. THE ML_Service SHALL serialize all trained models using Joblib with compression enabled
2. THE ML_Service SHALL store serialized models in a `models/` directory with version suffixes
3. THE ML_Service SHALL load the latest model version at startup based on filename convention
4. THE ML_Service SHALL log the loaded model version and training date for each model at startup
5. THE ML_Service SHALL include model metadata (training date, feature list, performance metrics) alongside each serialized model
6. THE ML_Service SHALL validate that loaded models match the expected feature count before accepting requests
7. WHEN a model file is corrupted or missing, THE ML_Service SHALL log a warning and use fallback logic exclusively for that endpoint

### Requirement 9: Feature Vector Completeness

**User Story:** As a Firebase Cloud Function developer, I want to know exactly which features each endpoint requires, so that I can construct complete and valid requests.

#### Acceptance Criteria

1. THE Premium_Engine SHALL require exactly 12 features: city_tier, zone_id, week_of_year, season_flag, forecasted_disruption_probability, shift_start_hour, shift_duration_hours, declared_weekly_income_slab, claim_count_last_4_weeks, trust_score, days_since_registration, prior_zone_disruption_density
2. THE Forecasting_Engine SHALL require city identifier, zone identifier, and historical disruption event timestamps
3. THE Fraud_Detector SHALL require exactly 20 features: motion_variance, network_type, rtt_ms, gps_accuracy_m, distance_from_home_km, route_continuity_score, speed_between_pings_kmh, claim_frequency_7d, days_since_registration, payout_account_change_days, simultaneous_claim_density_ratio, shared_device_count, claim_timestamp_cluster_size, emulator_flag, mock_location_flag, wifi_vs_cellular, gps_accuracy_stddev, teleportation_flag, zone_entry_plausibility, historical_zone_match
4. THE Confidence_Scorer SHALL require exactly 9 features: trigger_confirmed, zone_overlap_score, emulator_flag, speed_plausible, duplicate_check_passed, fraud_anomaly_score, historical_trust_score, claim_frequency_7d, device_consistency_score
5. THE ML_Service SHALL document the complete feature list, data type, and valid range for each feature in the API documentation
6. THE ML_Service SHALL reject requests with extra undocumented features to prevent confusion
7. THE ML_Service SHALL provide clear examples of valid request payloads in the `/docs` endpoint

### Requirement 10: Deployment and Environment Configuration

**User Story:** As a developer deploying the ML_Service, I want clear environment configuration and deployment instructions, so that I can deploy to Render and connect it to Firebase Cloud Functions.

#### Acceptance Criteria

1. THE ML_Service SHALL read configuration from environment variables for model paths, log levels, and CORS origins
2. THE ML_Service SHALL include a `requirements.txt` file listing all Python dependencies with pinned versions
3. THE ML_Service SHALL include a `Dockerfile` for containerized deployment on Render
4. THE ML_Service SHALL enable CORS for requests from Firebase Cloud Functions domains
5. THE ML_Service SHALL include a `README.md` with setup instructions, API usage examples, and deployment steps
6. THE ML_Service SHALL expose the service on port 8000 by default, configurable via environment variable
7. THE ML_Service SHALL include a `.env.example` file documenting all required environment variables
8. THE ML_Service SHALL log startup completion with service URL and loaded model count
