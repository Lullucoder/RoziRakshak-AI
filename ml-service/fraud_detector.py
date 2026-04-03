"""
Fraud Detector - Module 3
Isolation Forest-based anomaly detection with hard-coded rule fallback.
"""

import os
import json
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# Global model state
fraud_model = None
fraud_metadata = None

router = APIRouter()


# Request/Response Models
class FraudFeatures(BaseModel):
    """20-feature vector for fraud detection"""
    motion_variance: float = Field(..., ge=0.0, le=100.0, description="Accelerometer variance over 30s")
    network_type: str = Field(..., description="Connection type")
    rtt_ms: float = Field(..., ge=0.0, le=5000.0, description="Network round-trip time")
    gps_accuracy_m: float = Field(..., ge=0.0, le=500.0, description="GPS accuracy radius")
    distance_from_home_km: float = Field(..., ge=0.0, le=100.0, description="Distance from registered home")
    route_continuity_score: float = Field(..., ge=0.0, le=1.0, description="Path plausibility")
    speed_between_pings_kmh: float = Field(..., ge=0.0, le=150.0, description="Movement speed")
    claim_frequency_7d: int = Field(..., ge=0, le=20, description="Claims in last 7 days")
    days_since_registration: int = Field(..., ge=0, le=3650, description="Account age")
    payout_account_change_days: int = Field(..., ge=0, le=3650, description="Days since UPI change")
    simultaneous_claim_density_ratio: float = Field(..., ge=0.0, le=50.0, description="Zone claim density vs normal")
    shared_device_count: int = Field(..., ge=0, le=10, description="Accounts sharing device fingerprint")
    claim_timestamp_cluster_size: int = Field(..., ge=0, le=1000, description="Claims in 3-minute window")
    emulator_flag: bool = Field(..., description="Emulator detection")
    mock_location_flag: bool = Field(..., description="Mock GPS detection")
    wifi_vs_cellular: str = Field(..., description="Network pattern")
    gps_accuracy_stddev: float = Field(..., ge=0.0, le=200.0, description="GPS accuracy variation")
    teleportation_flag: bool = Field(..., description="Impossible movement detected")
    zone_entry_plausibility: float = Field(..., ge=0.0, le=1.0, description="Entry path likelihood")
    historical_zone_match: bool = Field(..., description="Matches typical zones")


class FraudRequest(BaseModel):
    request_id: Optional[str] = None
    claim_id: str
    features: FraudFeatures


class FraudContribution(BaseModel):
    feature: str
    contribution: float
    reason: str


class FraudResponse(BaseModel):
    request_id: str
    status: str
    claim_id: str
    anomaly_score: float
    risk_level: str
    top_contributing_features: List[FraudContribution]
    model_used: str
    fallback_rules_triggered: Optional[List[str]] = None
    timestamp: str


def load_fraud_model() -> Dict[str, Any]:
    """
    Load the serialized Isolation Forest model and metadata at startup.
    Returns model metadata dict.
    """
    global fraud_model, fraud_metadata
    
    models_dir = os.getenv("MODELS_DIR", "./models")
    model_version = os.getenv("FRAUD_MODEL_VERSION", "v1")
    
    model_path = os.path.join(models_dir, f"fraud_{model_version}.joblib")
    metadata_path = os.path.join(models_dir, f"fraud_{model_version}_metadata.json")
    
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Fraud model not found at {model_path}")
    
    # TODO: Uncomment when joblib is available
    # import joblib
    # fraud_model = joblib.load(model_path)
    
    # Load metadata
    if os.path.exists(metadata_path):
        with open(metadata_path, 'r') as f:
            fraud_metadata = json.load(f)
    else:
        fraud_metadata = {
            "version": model_version,
            "last_trained": None
        }
    
    return fraud_metadata


def detect_fraud_fallback(features: FraudFeatures) -> Dict[str, Any]:
    """
    Hard-coded rule engine fallback.
    Rules:
    1. speed > 80 km/h → hold
    2. emulator_flag → hold
    3. claim_frequency_7d > 3 → hold
    """
    triggered_rules = []
    
    # Rule 1: Impossible speed
    if features.speed_between_pings_kmh > 80:
        triggered_rules.append("Impossible speed detected")
    
    # Rule 2: Emulator detection
    if features.emulator_flag:
        triggered_rules.append("Emulator detected")
    
    # Rule 3: Excessive claim frequency
    if features.claim_frequency_7d > 3:
        triggered_rules.append("Excessive claim frequency")
    
    # Determine score and risk level
    if triggered_rules:
        anomaly_score = 1.0
        risk_level = "high"
        top_features = [
            FraudContribution(
                feature=rule.split()[0].lower(),
                contribution=1.0,
                reason=rule
            )
            for rule in triggered_rules[:3]
        ]
    else:
        anomaly_score = 0.1
        risk_level = "low"
        top_features = [
            FraudContribution(
                feature="all_checks_passed",
                contribution=0.0,
                reason="No suspicious patterns detected"
            )
        ]
    
    return {
        "anomaly_score": anomaly_score,
        "risk_level": risk_level,
        "top_contributing_features": top_features,
        "model_used": "fallback_rules",
        "fallback_rules_triggered": triggered_rules if triggered_rules else None
    }


@router.post("/score", response_model=FraudResponse)
async def score_fraud(request: FraudRequest):
    """
    Score a claim for fraud risk using Isolation Forest.
    Falls back to hard-coded rules if model unavailable.
    """
    request_id = request.request_id or f"fraud_{datetime.utcnow().timestamp()}"
    
    try:
        # TODO: Implement Isolation Forest prediction when model is trained
        # For now, always use fallback
        result = detect_fraud_fallback(request.features)
        
        return FraudResponse(
            request_id=request_id,
            status="success",
            claim_id=request.claim_id,
            anomaly_score=result["anomaly_score"],
            risk_level=result["risk_level"],
            top_contributing_features=result["top_contributing_features"],
            model_used=result["model_used"],
            fallback_rules_triggered=result["fallback_rules_triggered"],
            timestamp=datetime.utcnow().isoformat()
        )
    
    except Exception as e:
        logger.error(f"Fraud detection failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
