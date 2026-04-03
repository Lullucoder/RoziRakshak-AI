"""
Forecasting Engine - Module 2
Prophet-based disruption probability forecasting with rolling average fallback.
"""

import os
import json
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta

import pandas as pd
import numpy as np
from prophet import Prophet
import joblib

from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# Global model state
forecasting_models = {}  # Dict of zone_id -> model
forecasting_metadata = None

router = APIRouter()


# Request/Response Models
class ForecastDay(BaseModel):
    date: str
    disruption_probability: float
    confidence_interval_lower: float
    confidence_interval_upper: float
    risk_level: str


class NextWeekSummary(BaseModel):
    average_disruption_probability: float
    peak_risk_day: str
    recommended_premium_adjustment: float


class ForecastResponse(BaseModel):
    zone_id: str
    forecast_7d: List[ForecastDay]
    next_week_summary: NextWeekSummary
    model_used: str


class BatchForecastRequest(BaseModel):
    zone_ids: List[str] = Field(..., description="List of zone IDs to forecast")


class BatchForecastResponse(BaseModel):
    forecasts: List[ForecastResponse]
    timestamp: str


def get_indian_holidays() -> pd.DataFrame:
    """
    Get Indian public holidays for Prophet.
    Returns DataFrame with columns: holiday, ds, lower_window, upper_window
    """
    # Major Indian holidays (approximate dates for 2025-2026)
    holidays = pd.DataFrame({
        'holiday': [
            'Republic Day', 'Holi', 'Ram Navami', 'Good Friday',
            'Eid al-Fitr', 'Independence Day', 'Janmashtami',
            'Ganesh Chaturthi', 'Dussehra', 'Diwali', 'Guru Nanak Jayanti', 'Christmas'
        ],
        'ds': pd.to_datetime([
            '2025-01-26', '2025-03-14', '2025-04-06', '2025-04-18',
            '2025-04-10', '2025-08-15', '2025-08-16',
            '2025-08-27', '2025-10-02', '2025-10-20', '2025-11-05', '2025-12-25'
        ]),
        'lower_window': 0,
        'upper_window': 1
    })
    
    # Add 2026 holidays
    holidays_2026 = pd.DataFrame({
        'holiday': [
            'Republic Day', 'Holi', 'Ram Navami', 'Good Friday',
            'Eid al-Fitr', 'Independence Day', 'Janmashtami',
            'Ganesh Chaturthi', 'Dussehra', 'Diwali', 'Guru Nanak Jayanti', 'Christmas'
        ],
        'ds': pd.to_datetime([
            '2026-01-26', '2026-03-03', '2026-03-26', '2026-04-03',
            '2026-03-30', '2026-08-15', '2026-09-05',
            '2026-09-16', '2026-10-22', '2026-11-08', '2026-11-24', '2026-12-25'
        ]),
        'lower_window': 0,
        'upper_window': 1
    })
    
    return pd.concat([holidays, holidays_2026], ignore_index=True)


def add_monsoon_regressor(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add monsoon regressor to dataframe.
    is_monsoon = 1 for June-September (months 6-9), 0 otherwise
    """
    df = df.copy()
    df['is_monsoon'] = df['ds'].dt.month.isin([6, 7, 8, 9]).astype(int)
    return df


def train_forecasting_models(data_path: str = "./data/disruption_history.csv",
                             models_dir: str = "./models") -> Dict[str, Any]:
    """
    Train Prophet models for each zone.
    
    Returns:
        Dict with training metadata
    """
    logger.info("Training Forecasting Engine (Prophet)...")
    
    # Load data
    df = pd.read_csv(data_path)
    df['ds'] = pd.to_datetime(df['ds'])
    logger.info(f"Loaded {len(df)} disruption events")
    
    # Get unique zones
    zones = sorted(df['zone_id'].unique())
    logger.info(f"Training models for {len(zones)} zones: {zones}")
    
    # Get holidays
    holidays = get_indian_holidays()
    
    trained_models = {}
    metadata = {
        'version': 'v1',
        'trained_at': datetime.utcnow().isoformat(),
        'zones': {},
        'n_zones': len(zones)
    }
    
    for zone_id in zones:
        logger.info(f"\nTraining model for {zone_id}...")
        
        # Filter data for this zone
        zone_df = df[df['zone_id'] == zone_id][['ds', 'disruption_occurred']].copy()
        zone_df.columns = ['ds', 'y']
        
        # Check if we have enough data (at least 8 weeks = 56 days)
        if len(zone_df) < 56:
            logger.warning(f"  Insufficient data for {zone_id} ({len(zone_df)} days). Skipping Prophet training.")
            metadata['zones'][zone_id] = {
                'trained': False,
                'reason': 'insufficient_data',
                'n_samples': len(zone_df)
            }
            continue
        
        # Add monsoon regressor
        zone_df = add_monsoon_regressor(zone_df)
        
        # Initialize Prophet
        model = Prophet(
            daily_seasonality=False,
            weekly_seasonality=True,
            yearly_seasonality=True,
            holidays=holidays,
            interval_width=0.80,  # 80% confidence interval
            changepoint_prior_scale=0.05  # Less flexible to avoid overfitting
        )
        
        # Add monsoon regressor
        model.add_regressor('is_monsoon')
        
        # Fit model (suppress Prophet's verbose output)
        import logging as prophet_logging
        prophet_logging.getLogger('prophet').setLevel(prophet_logging.WARNING)
        
        model.fit(zone_df)
        
        # Generate 14-day forecast
        future = model.make_future_dataframe(periods=14)
        future = add_monsoon_regressor(future)
        forecast = model.predict(future)
        
        # Calculate metrics on historical data
        historical_forecast = forecast[forecast['ds'].isin(zone_df['ds'])]
        mae = np.mean(np.abs(historical_forecast['yhat'] - zone_df['y']))
        
        logger.info(f"  ✓ Model trained for {zone_id}")
        logger.info(f"    Historical MAE: {mae:.3f}")
        logger.info(f"    Training samples: {len(zone_df)}")
        
        # Save model
        model_path = os.path.join(models_dir, f"prophet_{zone_id}.joblib")
        joblib.dump({
            'model': model,
            'zone_id': zone_id,
            'last_training_date': zone_df['ds'].max().isoformat()
        }, model_path)
        
        trained_models[zone_id] = model
        
        metadata['zones'][zone_id] = {
            'trained': True,
            'n_samples': len(zone_df),
            'mae': float(mae),
            'last_training_date': zone_df['ds'].max().isoformat()
        }
    
    # Save metadata
    os.makedirs(models_dir, exist_ok=True)
    metadata_path = os.path.join(models_dir, "forecasting_metadata.json")
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    logger.info(f"\n✓ Training complete!")
    logger.info(f"  Trained models: {len(trained_models)}/{len(zones)}")
    logger.info(f"  Metadata saved to {metadata_path}")
    
    return metadata


def load_forecasting_model() -> Dict[str, Any]:
    """
    Load all serialized Prophet models at startup.
    Returns metadata dict.
    """
    global forecasting_models, forecasting_metadata
    
    models_dir = os.getenv("MODELS_DIR", "./models")
    metadata_path = os.path.join(models_dir, "forecasting_metadata.json")
    
    # Load metadata
    if os.path.exists(metadata_path):
        with open(metadata_path, 'r') as f:
            forecasting_metadata = json.load(f)
    else:
        raise FileNotFoundError(f"Forecasting metadata not found at {metadata_path}")
    
    # Load all zone models
    loaded_count = 0
    for zone_id, zone_meta in forecasting_metadata.get('zones', {}).items():
        if not zone_meta.get('trained', False):
            continue
        
        model_path = os.path.join(models_dir, f"prophet_{zone_id}.joblib")
        if os.path.exists(model_path):
            model_data = joblib.load(model_path)
            forecasting_models[zone_id] = model_data
            loaded_count += 1
    
    logger.info(f"Forecasting models loaded: {loaded_count} zones")
    
    return forecasting_metadata


def calculate_risk_level(probability: float) -> str:
    """Determine risk level from disruption probability"""
    if probability < 0.20:
        return "Low"
    elif probability < 0.40:
        return "Medium"
    else:
        return "High"


def forecast_prophet(zone_id: str, days: int = 7) -> Dict[str, Any]:
    """
    Generate forecast using Prophet model for a specific zone.
    """
    if zone_id not in forecasting_models:
        raise ValueError(f"No trained model for zone {zone_id}")
    
    model_data = forecasting_models[zone_id]
    model = model_data['model']
    
    # Generate forecast
    future = model.make_future_dataframe(periods=14)
    future = add_monsoon_regressor(future)
    forecast = model.predict(future)
    
    # Get next 7 days (starting from tomorrow)
    tomorrow = pd.Timestamp.now().normalize() + pd.Timedelta(days=1)
    forecast_7d = forecast[forecast['ds'] >= tomorrow].head(days)
    
    # Build response
    forecast_days = []
    for _, row in forecast_7d.iterrows():
        # Clip probability to [0, 1]
        prob = float(np.clip(row['yhat'], 0, 1))
        lower = float(np.clip(row['yhat_lower'], 0, 1))
        upper = float(np.clip(row['yhat_upper'], 0, 1))
        
        forecast_days.append({
            'date': row['ds'].strftime('%Y-%m-%d'),
            'disruption_probability': round(prob, 3),
            'confidence_interval_lower': round(lower, 3),
            'confidence_interval_upper': round(upper, 3),
            'risk_level': calculate_risk_level(prob)
        })
    
    # Calculate summary
    avg_prob = np.mean([d['disruption_probability'] for d in forecast_days])
    peak_day = max(forecast_days, key=lambda x: x['disruption_probability'])
    
    # Premium adjustment: 1.0 + (avg_prob * 0.5)
    # e.g., 40% disruption prob → 1.2x premium
    premium_adjustment = round(1.0 + (avg_prob * 0.5), 2)
    
    return {
        'forecast_7d': forecast_days,
        'next_week_summary': {
            'average_disruption_probability': round(avg_prob, 3),
            'peak_risk_day': peak_day['date'],
            'recommended_premium_adjustment': premium_adjustment
        },
        'model_used': 'prophet'
    }


def forecast_fallback(zone_id: str, data_path: str = "./data/disruption_history.csv") -> Dict[str, Any]:
    """
    Fallback: 4-week rolling average disruption frequency.
    """
    try:
        # Load data
        df = pd.read_csv(data_path)
        df['ds'] = pd.to_datetime(df['ds'])
        
        # Filter for this zone
        zone_df = df[df['zone_id'] == zone_id].copy()
        
        if len(zone_df) == 0:
            # No data for this zone - use global average
            avg_prob = df['disruption_occurred'].mean()
        else:
            # Get last 28 days (4 weeks)
            last_28_days = zone_df.tail(28)
            avg_prob = last_28_days['disruption_occurred'].mean()
        
        # Clip to reasonable range
        avg_prob = float(np.clip(avg_prob, 0.05, 0.85))
        
        # Generate flat forecast for 7 days
        tomorrow = datetime.now().date() + timedelta(days=1)
        forecast_days = []
        
        for i in range(7):
            date = tomorrow + timedelta(days=i)
            forecast_days.append({
                'date': date.strftime('%Y-%m-%d'),
                'disruption_probability': round(avg_prob, 3),
                'confidence_interval_lower': round(max(0, avg_prob - 0.1), 3),
                'confidence_interval_upper': round(min(1, avg_prob + 0.1), 3),
                'risk_level': calculate_risk_level(avg_prob)
            })
        
        premium_adjustment = round(1.0 + (avg_prob * 0.5), 2)
        
        return {
            'forecast_7d': forecast_days,
            'next_week_summary': {
                'average_disruption_probability': round(avg_prob, 3),
                'peak_risk_day': forecast_days[0]['date'],  # All days same, pick first
                'recommended_premium_adjustment': premium_adjustment
            },
            'model_used': 'fallback_rolling_average'
        }
    
    except Exception as e:
        logger.error(f"Fallback forecast failed: {e}")
        # Ultimate fallback - return safe default
        default_prob = 0.20
        tomorrow = datetime.now().date() + timedelta(days=1)
        forecast_days = []
        
        for i in range(7):
            date = tomorrow + timedelta(days=i)
            forecast_days.append({
                'date': date.strftime('%Y-%m-%d'),
                'disruption_probability': default_prob,
                'confidence_interval_lower': 0.10,
                'confidence_interval_upper': 0.30,
                'risk_level': 'Medium'
            })
        
        return {
            'forecast_7d': forecast_days,
            'next_week_summary': {
                'average_disruption_probability': default_prob,
                'peak_risk_day': forecast_days[0]['date'],
                'recommended_premium_adjustment': 1.10
            },
            'model_used': 'emergency_fallback'
        }


@router.get("/{zone_id}", response_model=ForecastResponse)
async def get_forecast(zone_id: str = Path(..., description="Zone ID to forecast")):
    """
    Get 7-day disruption forecast for a specific zone.
    Uses Prophet model if available, falls back to rolling average otherwise.
    Never returns 500 - always returns a valid forecast.
    """
    try:
        # Try Prophet forecast
        if zone_id in forecasting_models:
            try:
                result = forecast_prophet(zone_id, days=7)
            except Exception as e:
                logger.warning(f"Prophet forecast failed for {zone_id}: {e}. Using fallback.")
                result = forecast_fallback(zone_id)
        else:
            result = forecast_fallback(zone_id)
        
        return ForecastResponse(
            zone_id=zone_id,
            forecast_7d=[ForecastDay(**day) for day in result['forecast_7d']],
            next_week_summary=NextWeekSummary(**result['next_week_summary']),
            model_used=result['model_used']
        )
    
    except Exception as e:
        # Ultimate fallback
        logger.error(f"Forecast failed completely for {zone_id}: {e}")
        result = forecast_fallback(zone_id)
        
        return ForecastResponse(
            zone_id=zone_id,
            forecast_7d=[ForecastDay(**day) for day in result['forecast_7d']],
            next_week_summary=NextWeekSummary(**result['next_week_summary']),
            model_used=result['model_used']
        )


@router.post("/batch", response_model=BatchForecastResponse)
async def get_batch_forecast(request: BatchForecastRequest):
    """
    Get forecasts for multiple zones in one call.
    Used by weekly Sunday recalculation job.
    Never returns 500 - always returns forecasts for all requested zones.
    """
    forecasts = []
    
    for zone_id in request.zone_ids:
        try:
            forecast = await get_forecast(zone_id)
            forecasts.append(forecast)
        except Exception as e:
            logger.error(f"Batch forecast failed for {zone_id}: {e}")
            # Add emergency fallback forecast
            result = forecast_fallback(zone_id)
            forecasts.append(ForecastResponse(
                zone_id=zone_id,
                forecast_7d=[ForecastDay(**day) for day in result['forecast_7d']],
                next_week_summary=NextWeekSummary(**result['next_week_summary']),
                model_used='emergency_fallback'
            ))
    
    return BatchForecastResponse(
        forecasts=forecasts,
        timestamp=datetime.utcnow().isoformat()
    )


# Training script entry point
if __name__ == "__main__":
    """Train the forecasting models"""
    import sys
    
    data_path = sys.argv[1] if len(sys.argv) > 1 else "./data/disruption_history.csv"
    
    if not os.path.exists(data_path):
        logger.error(f"Data file not found: {data_path}")
        logger.info("Please run: python synthetic_data.py first")
        sys.exit(1)
    
    metadata = train_forecasting_models(data_path)
    logger.info("\n✓ Training complete!")
    logger.info(f"Trained {metadata['n_zones']} zone models")


