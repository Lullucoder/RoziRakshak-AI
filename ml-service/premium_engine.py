"""
Premium Engine - Module 1
XGBoost-based personalized weekly premium calculation with deterministic fallback.
"""

import os
import json
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime

import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error
import xgboost as xgb
import joblib

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger(__name__)

# Global model state
premium_model = None
premium_metadata = None
feature_importances = None

router = APIRouter()


# Request/Response Models
class PremiumFeatures(BaseModel):
    """12-feature vector for premium calculation"""
    city_tier: int = Field(..., ge=1, le=3, description="City classification (1=metro, 2=tier-2, 3=tier-3)")
    zone_id: str = Field(..., description="Unique zone identifier")
    week_of_year: int = Field(..., ge=1, le=52, description="Week number for seasonality")
    season_flag: str = Field(..., description="Current season")
    forecasted_disruption_probability: float = Field(..., ge=0.0, le=1.0, description="Predicted disruption likelihood")
    shift_start_hour: int = Field(..., ge=0, le=23, description="Typical shift start time")
    shift_duration_hours: float = Field(..., ge=4.0, le=12.0, description="Average shift length")
    declared_weekly_income_slab: int = Field(..., description="Selected coverage tier")
    claim_count_last_4_weeks: int = Field(..., ge=0, le=8, description="Recent claim history")
    trust_score: float = Field(..., ge=0.0, le=1.0, description="Historical reliability score")
    days_since_registration: int = Field(..., ge=1, le=730, description="Account age")
    prior_zone_disruption_density: float = Field(..., ge=0.0, le=1.0, description="Historical zone risk")

    @field_validator('season_flag')
    @classmethod
    def validate_season(cls, v):
        valid_seasons = ['summer', 'monsoon', 'winter', 'spring']
        if v not in valid_seasons:
            raise ValueError(f"season_flag must be one of {valid_seasons}")
        return v

    @field_validator('declared_weekly_income_slab')
    @classmethod
    def validate_income_slab(cls, v):
        valid_slabs = [500, 1000, 1500, 2000, 2500]
        if v not in valid_slabs:
            raise ValueError(f"declared_weekly_income_slab must be one of {valid_slabs}")
        return v


class PremiumBreakdown(BaseModel):
    base: float
    zone_risk_adjustment: float
    shift_exposure_adjustment: float
    disruption_load_adjustment: float
    trust_discount: float


class PremiumResponse(BaseModel):
    premium_inr: float
    risk_tier: str
    top_reasons: List[str]
    plan_recommendation: str
    breakdown: PremiumBreakdown
    model_used: str


def train_premium_model(data_path: str = "./data/rider_profiles.csv", 
                       models_dir: str = "./models") -> Dict[str, Any]:
    """
    Train XGBoost model on rider profiles data.
    
    Returns:
        Dict with model metadata including RMSE and feature importances
    """
    logger.info("Training Premium Engine (XGBoost)...")
    
    # Load data
    df = pd.read_csv(data_path)
    logger.info(f"Loaded {len(df)} rider profiles")
    
    # Prepare features and target
    feature_cols = [col for col in df.columns if col != 'target_premium']
    X = df[feature_cols].copy()
    y = df['target_premium'].copy()
    
    # Encode categorical features
    # zone_id: label encoding
    zone_mapping = {zone: idx for idx, zone in enumerate(sorted(X['zone_id'].unique()))}
    X['zone_id_encoded'] = X['zone_id'].map(zone_mapping)
    
    # season_flag: one-hot encoding
    season_dummies = pd.get_dummies(X['season_flag'], prefix='season')
    X = pd.concat([X, season_dummies], axis=1)
    
    # Drop original categorical columns
    X = X.drop(['zone_id', 'season_flag'], axis=1)
    
    # Split train/test (80/20)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )
    
    logger.info(f"Train set: {len(X_train)} samples")
    logger.info(f"Test set: {len(X_test)} samples")
    
    # Train XGBoost
    model = xgb.XGBRegressor(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.1,
        subsample=0.8,
        random_state=42,
        objective='reg:squarederror'
    )
    
    model.fit(X_train, y_train)
    
    # Evaluate
    y_pred = model.predict(X_test)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    
    logger.info(f"✓ Model trained successfully")
    logger.info(f"  RMSE on test set: ₹{rmse:.2f}")
    logger.info(f"  Mean premium: ₹{y_test.mean():.2f}")
    logger.info(f"  RMSE as % of mean: {(rmse / y_test.mean() * 100):.1f}%")
    
    # Extract feature importances
    feature_importance_dict = dict(zip(X.columns, model.feature_importances_))
    top_features = sorted(feature_importance_dict.items(), key=lambda x: x[1], reverse=True)[:5]
    
    logger.info(f"\nTop 5 feature importances:")
    for feat, importance in top_features:
        logger.info(f"  {feat}: {importance:.4f}")
    
    # Save model
    os.makedirs(models_dir, exist_ok=True)
    model_path = os.path.join(models_dir, "premium_model.joblib")
    joblib.dump({
        'model': model,
        'feature_columns': list(X.columns),
        'zone_mapping': zone_mapping,
        'top_features': dict(top_features)
    }, model_path)
    
    # Save metadata
    metadata = {
        'version': 'v1',
        'trained_at': datetime.utcnow().isoformat(),
        'rmse': float(rmse),
        'n_train_samples': int(len(X_train)),
        'n_test_samples': int(len(X_test)),
        'top_features': {k: float(v) for k, v in top_features}
    }
    
    metadata_path = os.path.join(models_dir, "premium_model_metadata.json")
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    logger.info(f"✓ Model saved to {model_path}")
    logger.info(f"✓ Metadata saved to {metadata_path}")
    
    return metadata


def load_premium_model() -> Dict[str, Any]:
    """
    Load the serialized XGBoost model and metadata at startup.
    Returns model metadata dict.
    """
    global premium_model, premium_metadata, feature_importances
    
    models_dir = os.getenv("MODELS_DIR", "./models")
    model_path = os.path.join(models_dir, "premium_model.joblib")
    metadata_path = os.path.join(models_dir, "premium_model_metadata.json")
    
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Premium model not found at {model_path}")
    
    # Load model
    model_data = joblib.load(model_path)
    premium_model = model_data
    
    # Load metadata
    if os.path.exists(metadata_path):
        with open(metadata_path, 'r') as f:
            premium_metadata = json.load(f)
    else:
        premium_metadata = {
            "version": "v1",
            "trained_at": None
        }
    
    feature_importances = model_data.get('top_features', {})
    
    logger.info(f"Premium model loaded: RMSE ₹{premium_metadata.get('rmse', 0):.2f}")
    
    return premium_metadata


def map_feature_to_reason(feature_name: str, feature_value: Any) -> str:
    """Map feature names to plain English reasons"""
    reason_map = {
        'forecasted_disruption_probability': f"High disruption forecast in your zone",
        'prior_zone_disruption_density': f"Zone has history of disruptions",
        'city_tier': f"Metro city pricing applied",
        'claim_count_last_4_weeks': f"Recent claim history considered",
        'trust_score': f"Trust score affects pricing",
        'shift_start_hour': f"Shift timing affects risk",
        'declared_weekly_income_slab': f"Coverage tier selected",
        'season': f"Seasonal risk adjustment",
        'week_of_year': f"Time of year affects risk",
        'days_since_registration': f"Account tenure considered"
    }
    
    # Match partial feature names (for one-hot encoded features)
    for key, reason in reason_map.items():
        if key in feature_name:
            return reason
    
    return f"{feature_name.replace('_', ' ').title()} affects premium"


def predict_premium_xgboost(features: PremiumFeatures) -> Dict[str, Any]:
    """
    Predict premium using trained XGBoost model.
    """
    if premium_model is None:
        raise ValueError("Model not loaded")
    
    # Prepare input features
    input_data = {
        'city_tier': features.city_tier,
        'week_of_year': features.week_of_year,
        'forecasted_disruption_probability': features.forecasted_disruption_probability,
        'shift_start_hour': features.shift_start_hour,
        'shift_duration_hours': features.shift_duration_hours,
        'declared_weekly_income_slab': features.declared_weekly_income_slab,
        'claim_count_last_4_weeks': features.claim_count_last_4_weeks,
        'trust_score': features.trust_score,
        'days_since_registration': features.days_since_registration,
        'prior_zone_disruption_density': features.prior_zone_disruption_density
    }
    
    # Encode zone_id
    zone_mapping = premium_model['zone_mapping']
    if features.zone_id in zone_mapping:
        input_data['zone_id_encoded'] = zone_mapping[features.zone_id]
    else:
        # Unknown zone - use median encoding
        input_data['zone_id_encoded'] = len(zone_mapping) // 2
    
    # One-hot encode season
    for season in ['monsoon', 'spring', 'summer', 'winter']:
        input_data[f'season_{season}'] = 1 if features.season_flag == season else 0
    
    # Create DataFrame with correct column order
    feature_columns = premium_model['feature_columns']
    input_df = pd.DataFrame([input_data])[feature_columns]
    
    # Predict
    model = premium_model['model']
    predicted_premium = model.predict(input_df)[0]
    predicted_premium = round(max(19, min(79, predicted_premium)))  # Clip to valid range
    
    # Get top reasons from feature importances
    top_features = list(feature_importances.keys())[:2]
    top_reasons = [map_feature_to_reason(feat, None) for feat in top_features]
    
    # Calculate breakdown (approximate from model)
    base = {500: 25, 1000: 35, 1500: 45, 2000: 55, 2500: 65}.get(features.declared_weekly_income_slab, 40)
    zone_risk_adj = (features.prior_zone_disruption_density - 0.2) * 10
    shift_adj = 5 if 14 <= features.shift_start_hour < 18 else 0
    disruption_adj = features.forecasted_disruption_probability * 15
    trust_disc = -(features.trust_score * 8)
    
    return {
        'premium_inr': float(predicted_premium),
        'breakdown': {
            'base': round(base, 2),
            'zone_risk_adjustment': round(zone_risk_adj, 2),
            'shift_exposure_adjustment': round(shift_adj, 2),
            'disruption_load_adjustment': round(disruption_adj, 2),
            'trust_discount': round(trust_disc, 2)
        },
        'top_reasons': top_reasons,
        'model_used': 'xgboost'
    }


def calculate_premium_fallback(features: PremiumFeatures) -> Dict[str, Any]:
    """
    Deterministic fallback logic using multiplier table.
    Formula: premium = base_amount × city_multiplier × zone_risk_multiplier × shift_multiplier
    """
    # Load multiplier table
    models_dir = os.getenv("MODELS_DIR", "./models")
    multiplier_path = os.path.join(models_dir, "multiplier_table.json")
    
    # Default multiplier table
    default_multipliers = {
        "city_tier": {"1": 1.3, "2": 1.1, "3": 1.0},
        "zone_risk_band": {"low": 1.0, "medium": 1.2, "high": 1.5},
        "shift_period": {"morning": 1.0, "afternoon": 1.3, "night": 1.1},
        "base_amounts": {"500": 25, "1000": 35, "1500": 45, "2000": 55, "2500": 65}
    }
    
    if os.path.exists(multiplier_path):
        with open(multiplier_path, 'r') as f:
            multipliers = json.load(f)
    else:
        multipliers = default_multipliers
    
    # Determine zone risk band based on prior_zone_disruption_density
    if features.prior_zone_disruption_density < 0.25:
        zone_risk_band = "low"
    elif features.prior_zone_disruption_density < 0.35:
        zone_risk_band = "medium"
    else:
        zone_risk_band = "high"
    
    # Determine shift period
    if 6 <= features.shift_start_hour < 14:
        shift_period = "morning"
    elif 14 <= features.shift_start_hour < 22:
        shift_period = "afternoon"
    else:
        shift_period = "night"
    
    # Calculate premium
    base_amount = multipliers["base_amounts"][str(features.declared_weekly_income_slab)]
    city_mult = multipliers["city_tier"][str(features.city_tier)]
    zone_mult = multipliers["zone_risk_band"][zone_risk_band]
    shift_mult = multipliers["shift_period"][shift_period]
    
    # Additional adjustments
    disruption_mult = 1 + (features.forecasted_disruption_probability * 0.3)
    trust_discount = 1 - (features.trust_score * 0.1)
    claim_penalty = 1 + (features.claim_count_last_4_weeks * 0.03)
    
    premium = base_amount * city_mult * zone_mult * shift_mult * disruption_mult * trust_discount * claim_penalty
    premium = round(max(19, min(79, premium)))
    
    # Calculate breakdown
    breakdown = {
        'base': float(base_amount),
        'zone_risk_adjustment': float((zone_mult - 1) * base_amount),
        'shift_exposure_adjustment': float((shift_mult - 1) * base_amount),
        'disruption_load_adjustment': float((disruption_mult - 1) * base_amount),
        'trust_discount': float((trust_discount - 1) * base_amount)
    }
    
    top_reasons = [
        f"City tier {features.city_tier} pricing applied",
        f"Zone classified as {zone_risk_band} risk"
    ]
    
    return {
        'premium_inr': float(premium),
        'breakdown': breakdown,
        'top_reasons': top_reasons,
        'model_used': 'fallback_rules'
    }


def determine_risk_tier(premium: float) -> str:
    """Determine risk tier based on premium amount"""
    if premium < 35:
        return "Low"
    elif premium < 55:
        return "Medium"
    else:
        return "High"


def determine_plan_recommendation(income_slab: int, premium: float) -> str:
    """Recommend plan based on income slab and premium"""
    if income_slab <= 1000:
        return "Lite"
    elif income_slab <= 1500:
        return "Core"
    else:
        return "Peak"


@router.post("/quote", response_model=PremiumResponse)
async def calculate_premium(features: PremiumFeatures):
    """
    Calculate personalized weekly premium for a rider.
    Uses XGBoost model if available, falls back to deterministic rules otherwise.
    Never returns 500 - always returns a valid premium.
    """
    try:
        # Try XGBoost prediction
        if premium_model is not None:
            try:
                result = predict_premium_xgboost(features)
            except Exception as e:
                logger.warning(f"XGBoost prediction failed: {e}. Using fallback.")
                result = calculate_premium_fallback(features)
        else:
            result = calculate_premium_fallback(features)
        
        # Determine risk tier and plan recommendation
        risk_tier = determine_risk_tier(result['premium_inr'])
        plan_recommendation = determine_plan_recommendation(
            features.declared_weekly_income_slab,
            result['premium_inr']
        )
        
        return PremiumResponse(
            premium_inr=result['premium_inr'],
            risk_tier=risk_tier,
            top_reasons=result['top_reasons'],
            plan_recommendation=plan_recommendation,
            breakdown=PremiumBreakdown(**result['breakdown']),
            model_used=result['model_used']
        )
    
    except Exception as e:
        # Ultimate fallback - return a safe default premium
        logger.error(f"Premium calculation failed completely: {e}")
        
        # Simple fallback based on income slab
        base_premium = {500: 25, 1000: 35, 1500: 45, 2000: 55, 2500: 65}.get(
            features.declared_weekly_income_slab, 40
        )
        
        return PremiumResponse(
            premium_inr=float(base_premium),
            risk_tier="Medium",
            top_reasons=["Base premium applied", "Standard risk assessment"],
            plan_recommendation=determine_plan_recommendation(features.declared_weekly_income_slab, base_premium),
            breakdown=PremiumBreakdown(
                base=float(base_premium),
                zone_risk_adjustment=0.0,
                shift_exposure_adjustment=0.0,
                disruption_load_adjustment=0.0,
                trust_discount=0.0
            ),
            model_used="emergency_fallback"
        )


# Training script entry point
if __name__ == "__main__":
    """Train the premium model"""
    import sys
    
    data_path = sys.argv[1] if len(sys.argv) > 1 else "./data/rider_profiles.csv"
    
    if not os.path.exists(data_path):
        logger.error(f"Data file not found: {data_path}")
        logger.info("Please run: python synthetic_data.py first")
        sys.exit(1)
    
    metadata = train_premium_model(data_path)
    logger.info("\n✓ Training complete!")
    logger.info(f"Model ready for inference with RMSE: ₹{metadata['rmse']:.2f}")


