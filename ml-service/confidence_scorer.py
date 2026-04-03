"""
Confidence Scorer - Module 4
Logistic Regression-based claim confidence scoring with weighted rule fallback.
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
confidence_model = None
confidence_metadata = None

router = APIRouter()


# Request/Response Models
class ConfidenceFeatures(BaseModel):
    """9-feature vector for confidence scoring"""
    trigger_confirmed: bool = Field(..., description="External trigger validated")
    zone_overlap_score: float = Field(..., ge=0.0, le=1.0, description="Worker-trigger zone match")
    emulator_flag: bool = Field(..., description="Emulator detected")
    speed_plausible: bool = Field(..., description="Movement speed realistic")
    duplicate_check_passed: bool = Field(..., description="No duplicate claim")
    fraud_anomaly_score: float = Field(..., ge=0.0, le=1.0, description="Output from fraud detector")
    historical_trust_score: float = Field(..., ge=0.0, le=1.0, description="Long-term reliability")
    claim_frequency_7d: int = Field(..., ge=0, le=20, description="Recent claim count")
    device_consistency_score: float = Field(..., ge=0.0, le=1.0, description="Device fingerprint stability")


class ConfidenceRequest(BaseModel):
    request_id: Optional[str] = None
    claim_id: str
    features: ConfidenceFeatures


class ConfidenceContribution(BaseModel):
    feature: str
    coefficient: float
    reason: str


class FallbackChecks(BaseModel):
    trigger_confirmed: bool
    zone_overlap: bool
    no_emulator: bool
    speed_plausible: bool
    no_duplicate: bool


class ConfidenceResponse(BaseModel):
    request_id: str
    status: str
    claim_id: str
    confidence_score: float
    decision_track: str
    top_contributing_features: List[ConfidenceContribution]
    model_used: str
    fallback_checks: Optional[FallbackChecks] = None
    timestamp: str


def load_confidence_model() -> Dict[str, Any]:
    """
    Load the serialized Logistic Regression model and metadata at startup.
    Returns model metadata dict.
    """
    global confidence_model, confidence_metadata
    
    models_dir = os.getenv("MODELS_DIR", "./models")
    model_version = os.getenv("CONFIDENCE_MODEL_VERSION", "v1")
    
    model_path = os.path.join(models_dir, f"confidence_{model_version}.joblib")
    metadata_path = os.path.join(models_dir, f"confidence_{model_version}_metadata.json")
    
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Confidence model not found at {model_path}")
    
    # TODO: Uncomment when joblib is available
    # import joblib
    # confidence_model = joblib.load(model_path)
    
    # Load metadata
    if os.path.exists(metadata_path):
        with open(metadata_path, 'r') as f:
            confidence_metadata = json.load(f)
    else:
        confidence_metadata = {
            "version": model_version,
            "last_trained": None
        }
    
    return confidence_metadata


def score_confidence_fallback(features: ConfidenceFeatures) -> Dict[str, Any]:
    """
    Weighted binary rule fallback.
    5 checks, each worth 0.2:
    1. trigger_confirmed
    2. zone_overlap_score > 0.5
    3. emulator_flag == false
    4. speed_plausible
    5. duplicate_check_passed
    """
    score = 0.0
    
    # Check 1: Trigger confirmed
    check_trigger = features.trigger_confirmed
    if check_trigger:
        score += 0.2
    
    # Check 2: Zone overlap
    check_zone = features.zone_overlap_score > 0.5
    if check_zone:
        score += 0.2
    
    # Check 3: No emulator
    check_emulator = not features.emulator_flag
    if check_emulator:
        score += 0.2
    
    # Check 4: Speed plausible
    check_speed = features.speed_plausible
    if check_speed:
        score += 0.2
    
    # Check 5: No duplicate
    check_duplicate = features.duplicate_check_passed
    if check_duplicate:
        score += 0.2
    
    # Determine decision track
    if score >= 0.75:
        decision_track = "auto_approve"
    elif score >= 0.40:
        decision_track = "soft_review"
    else:
        decision_track = "hold"
    
    # Build top contributing features
    contributions = []
    if check_trigger:
        contributions.append(ConfidenceContribution(
            feature="trigger_confirmed",
            coefficient=0.2,
            reason="External trigger validated"
        ))
    if check_zone:
        contributions.append(ConfidenceContribution(
            feature="zone_overlap_score",
            coefficient=0.2,
            reason="Worker location matches trigger zone"
        ))
    
    return {
        "confidence_score": score,
        "decision_track": decision_track,
        "top_contributing_features": contributions[:2],
        "model_used": "fallback_rules",
        "fallback_checks": FallbackChecks(
            trigger_confirmed=check_trigger,
            zone_overlap=check_zone,
            no_emulator=check_emulator,
            speed_plausible=check_speed,
            no_duplicate=check_duplicate
        )
    }


@router.post("/score", response_model=ConfidenceResponse)
async def score_confidence(request: ConfidenceRequest):
    """
    Calculate claim approval confidence score using Logistic Regression.
    Falls back to weighted binary checks if model unavailable.
    """
    request_id = request.request_id or f"conf_{datetime.utcnow().timestamp()}"
    
    try:
        # TODO: Implement Logistic Regression prediction when model is trained
        # For now, always use fallback
        result = score_confidence_fallback(request.features)
        
        return ConfidenceResponse(
            request_id=request_id,
            status="success",
            claim_id=request.claim_id,
            confidence_score=result["confidence_score"],
            decision_track=result["decision_track"],
            top_contributing_features=result["top_contributing_features"],
            model_used=result["model_used"],
            fallback_checks=result["fallback_checks"],
            timestamp=datetime.utcnow().isoformat()
        )
    
    except Exception as e:
        logger.error(f"Confidence scoring failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
