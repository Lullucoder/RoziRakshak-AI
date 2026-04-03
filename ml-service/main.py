"""
RoziRakshak AI - ML Microservice API
FastAPI server exposing 4 AI model endpoints for premium pricing, forecasting, fraud detection, and confidence scoring.
"""

import os
import logging
from contextlib import asynccontextmanager
from typing import Dict, Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from premium_engine import router as premium_router, load_premium_model
from forecasting import router as forecasting_router, load_forecasting_model
from fraud_detector import router as fraud_router, load_fraud_model
from confidence_scorer import router as confidence_router, load_confidence_model

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Global model state
models_state: Dict[str, Any] = {
    "premium_engine": {"loaded": False, "version": None, "error": None},
    "forecasting_engine": {"loaded": False, "version": None, "error": None},
    "fraud_detector": {"loaded": False, "version": None, "error": None},
    "confidence_scorer": {"loaded": False, "version": None, "error": None}
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager - loads all models at startup.
    If a model fails to load, logs warning but continues (fallback logic will be used).
    """
    logger.info("Starting ML Microservice API...")
    
    # Load Premium Engine
    try:
        model_info = load_premium_model()
        models_state["premium_engine"] = {
            "loaded": True,
            "version": model_info.get("version", "v1"),
            "last_trained": model_info.get("last_trained"),
            "error": None
        }
        logger.info(f"✓ Premium Engine loaded: {model_info.get('version')}")
    except Exception as e:
        logger.warning(f"✗ Premium Engine failed to load: {e}. Will use fallback logic.")
        models_state["premium_engine"]["error"] = str(e)
    
    # Load Forecasting Engine
    try:
        model_info = load_forecasting_model()
        models_state["forecasting_engine"] = {
            "loaded": True,
            "version": model_info.get("version", "v1"),
            "last_trained": model_info.get("last_trained"),
            "error": None
        }
        logger.info(f"✓ Forecasting Engine loaded: {model_info.get('version')}")
    except Exception as e:
        logger.warning(f"✗ Forecasting Engine failed to load: {e}. Will use fallback logic.")
        models_state["forecasting_engine"]["error"] = str(e)
    
    # Load Fraud Detector
    try:
        model_info = load_fraud_model()
        models_state["fraud_detector"] = {
            "loaded": True,
            "version": model_info.get("version", "v1"),
            "last_trained": model_info.get("last_trained"),
            "error": None
        }
        logger.info(f"✓ Fraud Detector loaded: {model_info.get('version')}")
    except Exception as e:
        logger.warning(f"✗ Fraud Detector failed to load: {e}. Will use fallback logic.")
        models_state["fraud_detector"]["error"] = str(e)
    
    # Load Confidence Scorer
    try:
        model_info = load_confidence_model()
        models_state["confidence_scorer"] = {
            "loaded": True,
            "version": model_info.get("version", "v1"),
            "last_trained": model_info.get("last_trained"),
            "error": None
        }
        logger.info(f"✓ Confidence Scorer loaded: {model_info.get('version')}")
    except Exception as e:
        logger.warning(f"✗ Confidence Scorer failed to load: {e}. Will use fallback logic.")
        models_state["confidence_scorer"]["error"] = str(e)
    
    loaded_count = sum(1 for m in models_state.values() if m["loaded"])
    logger.info(f"ML Microservice API ready. {loaded_count}/4 models loaded successfully.")
    
    yield
    
    logger.info("Shutting down ML Microservice API...")


# Initialize FastAPI app
app = FastAPI(
    title="RoziRakshak AI - ML Microservice",
    description="AI-powered pricing, forecasting, fraud detection, and confidence scoring for parametric insurance",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Health check endpoint
@app.get("/health")
async def health_check():
    """
    Health check endpoint - returns service status and model load states.
    """
    return {
        "status": "healthy",
        "service": "ml-microservice-api",
        "version": "1.0.0",
        "models": models_state,
        "fallback_available": True
    }


# Register routers
app.include_router(premium_router, prefix="/premium", tags=["Premium Engine"])
app.include_router(forecasting_router, prefix="/forecast", tags=["Forecasting"])
app.include_router(fraud_router, prefix="/fraud", tags=["Fraud Detection"])
app.include_router(confidence_router, prefix="/confidence", tags=["Confidence Scoring"])


# Root endpoint
@app.get("/")
async def root():
    return {
        "service": "RoziRakshak AI - ML Microservice",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "premium_quote": "/premium/quote",
            "disruption_forecast": "/forecast/disruption",
            "fraud_score": "/fraud/score",
            "confidence_score": "/confidence/score",
            "docs": "/docs"
        }
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=os.getenv("ENVIRONMENT") != "production"
    )
