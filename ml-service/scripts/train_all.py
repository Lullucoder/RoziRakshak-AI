"""
Master Training Script - RoziRakshak ML Microservice
Trains all 4 AI models in sequence with comprehensive logging.
"""

import os
import sys
import time
import logging
from pathlib import Path

# Add parent directory to path to import modules
sys.path.insert(0, str(Path(__file__).parent.parent))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def _is_truthy_env(var_name: str, default: bool = False) -> bool:
    """Parse boolean-like environment variables."""
    raw = os.getenv(var_name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "y", "on"}


def _has_required_model_artifacts(models_dir: Path) -> bool:
    """Return True when all core model artifacts needed by the API are present."""
    required_files = [
        "premium_model.joblib",
        "premium_model_metadata.json",
        "forecasting_metadata.json",
        "fraud_v1.joblib",
        "fraud_v1_metadata.json",
        "confidence_v1.joblib",
        "confidence_v1_metadata.json",
    ]

    missing = [name for name in required_files if not (models_dir / name).exists()]
    prophet_models = list(models_dir.glob("prophet_zone_*.joblib"))

    if missing:
        logger.info(f"Missing model artifacts: {missing}")
        return False

    if not prophet_models:
        logger.info("No Prophet zone models found (expected files matching prophet_zone_*.joblib)")
        return False

    return True


def _ensure_training_data(data_dir: Path) -> dict:
    """Create any missing training datasets and return their paths."""
    datasets = {
        "rider_profiles": data_dir / "rider_profiles.csv",
        "disruption_history": data_dir / "disruption_history.csv",
        "claim_signals": data_dir / "claim_signals.csv",
    }

    missing = [name for name, path in datasets.items() if not path.exists()]
    if not missing:
        logger.info("All required datasets already exist. Skipping synthetic data generation.")
        return {name: str(path) for name, path in datasets.items()}

    logger.info(f"Generating missing datasets: {missing}")

    import synthetic_data

    if "rider_profiles" in missing:
        synthetic_data.generate_rider_profiles(n_records=1000, output_dir=str(data_dir))
    if "disruption_history" in missing:
        synthetic_data.generate_disruption_history(n_zones=6, n_days=180, output_dir=str(data_dir))
    if "claim_signals" in missing:
        synthetic_data.generate_claim_signals(n_records=500, output_dir=str(data_dir))

    still_missing = [name for name, path in datasets.items() if not path.exists()]
    if still_missing:
        raise FileNotFoundError(f"Dataset generation incomplete. Missing files: {still_missing}")

    logger.info("✓ Synthetic data generation complete")
    return {name: str(path) for name, path in datasets.items()}


def main():
    """Train all 4 models in sequence"""
    start_time = time.time()
    
    print("\n" + "="*70)
    print("RoziRakshak ML Microservice - Master Training Script")
    print("="*70 + "\n")
    
    # Change to ml-service directory
    script_dir = Path(__file__).parent
    ml_service_dir = script_dir.parent
    os.chdir(ml_service_dir)
    
    logger.info(f"Working directory: {os.getcwd()}")
    
    # Create necessary directories
    data_dir = Path("data")
    models_dir = Path("models")
    data_dir.mkdir(exist_ok=True)
    models_dir.mkdir(exist_ok=True)

    # Skip retraining on deploy when model artifacts are already committed.
    # Set TRAIN_MODELS_ON_BUILD=true to force full retraining.
    force_retrain = _is_truthy_env("TRAIN_MODELS_ON_BUILD", default=False)
    if not force_retrain and _has_required_model_artifacts(models_dir):
        print("\n" + "-"*70)
        print("Pre-trained model artifacts detected. Skipping retraining.")
        print("Set TRAIN_MODELS_ON_BUILD=true to force retraining during build.")
        print("-"*70 + "\n")
        logger.info("Using existing model artifacts from ./models")
        return 0
    
    training_results = {}
    
    # ========================================================================
    # STEP 1: Generate Synthetic Data
    # ========================================================================
    print("\n" + "-"*70)
    print("STEP 1/5: Generating Synthetic Training Data")
    print("-"*70)
    
    try:
        dataset_paths = _ensure_training_data(data_dir)
        training_results['data_generation'] = 'success'
    except Exception as e:
        logger.error(f"✗ Synthetic data generation failed: {e}")
        training_results['data_generation'] = f'failed: {e}'
        return 1
    
    # ========================================================================
    # STEP 2: Train Premium Engine (XGBoost)
    # ========================================================================
    print("\n" + "-"*70)
    print("STEP 2/5: Training Premium Engine (XGBoost)")
    print("-"*70)
    
    try:
        from premium_engine import train_premium_model
        metadata = train_premium_model(
            data_path=dataset_paths["rider_profiles"],
            models_dir=str(models_dir)
        )
        training_results['premium_engine'] = {
            'status': 'success',
            'rmse': metadata['rmse'],
            'n_samples': metadata['n_train_samples'] + metadata['n_test_samples']
        }
        logger.info(f"✓ Premium Engine trained: RMSE ₹{metadata['rmse']:.2f}")
    except Exception as e:
        logger.error(f"✗ Premium Engine training failed: {e}")
        training_results['premium_engine'] = {'status': f'failed: {e}'}
        return 1
    
    # ========================================================================
    # STEP 3: Train Forecasting Engine (Prophet)
    # ========================================================================
    print("\n" + "-"*70)
    print("STEP 3/5: Training Forecasting Engine (Prophet)")
    print("-"*70)
    
    try:
        from forecasting import train_forecasting_models
        metadata = train_forecasting_models(
            data_path=dataset_paths["disruption_history"],
            models_dir=str(models_dir)
        )
        training_results['forecasting_engine'] = {
            'status': 'success',
            'n_zones': metadata['n_zones'],
            'zones': list(metadata['zones'].keys())
        }
        logger.info(f"✓ Forecasting Engine trained: {metadata['n_zones']} zones")
    except Exception as e:
        logger.error(f"✗ Forecasting Engine training failed: {e}")
        training_results['forecasting_engine'] = {'status': f'failed: {e}'}
        return 1
    
    # ========================================================================
    # STEP 4: Train Fraud Detector (Isolation Forest)
    # ========================================================================
    print("\n" + "-"*70)
    print("STEP 4/5: Training Fraud Detector (Isolation Forest)")
    print("-"*70)
    
    try:
        from fraud_detector import train_fraud_model
        metadata = train_fraud_model(
            data_path=dataset_paths["claim_signals"],
            models_dir=str(models_dir)
        )
        training_results['fraud_detector'] = {
            'status': 'success',
            'contamination': metadata['contamination'],
            'n_samples': metadata['n_samples']
        }
        logger.info(f"✓ Fraud Detector trained: {metadata['n_samples']} samples")
    except Exception as e:
        logger.error(f"✗ Fraud Detector training failed: {e}")
        training_results['fraud_detector'] = {'status': f'failed: {e}'}
        return 1
    
    # ========================================================================
    # STEP 5: Train Confidence Scorer (Logistic Regression)
    # ========================================================================
    print("\n" + "-"*70)
    print("STEP 5/5: Training Confidence Scorer (Logistic Regression)")
    print("-"*70)
    
    try:
        from confidence_scorer import train_confidence_model
        metadata = train_confidence_model(
            data_path=dataset_paths["claim_signals"],
            models_dir=str(models_dir)
        )
        training_results['confidence_scorer'] = {
            'status': 'success',
            'accuracy': metadata['accuracy'],
            'auc_roc': metadata['auc_roc'],
            'n_samples': metadata['n_samples']
        }
        logger.info(f"✓ Confidence Scorer trained: accuracy {metadata['accuracy']:.3f}")
    except Exception as e:
        logger.error(f"✗ Confidence Scorer training failed: {e}")
        training_results['confidence_scorer'] = {'status': f'failed: {e}'}
        return 1
    
    # ========================================================================
    # Training Summary
    # ========================================================================
    end_time = time.time()
    total_time = end_time - start_time
    
    print("\n" + "="*70)
    print("TRAINING SUMMARY")
    print("="*70)
    
    print(f"\n✓ All 4 models trained successfully in {total_time:.1f} seconds\n")
    
    print("Model Performance:")
    print(f"  1. Premium Engine (XGBoost)")
    print(f"     - RMSE: ₹{training_results['premium_engine']['rmse']:.2f}")
    print(f"     - Samples: {training_results['premium_engine']['n_samples']}")
    
    print(f"\n  2. Forecasting Engine (Prophet)")
    print(f"     - Zones: {training_results['forecasting_engine']['n_zones']}")
    print(f"     - Zone IDs: {', '.join(training_results['forecasting_engine']['zones'])}")
    
    print(f"\n  3. Fraud Detector (Isolation Forest)")
    print(f"     - Contamination: {training_results['fraud_detector']['contamination']}")
    print(f"     - Samples: {training_results['fraud_detector']['n_samples']}")
    
    print(f"\n  4. Confidence Scorer (Logistic Regression)")
    print(f"     - Accuracy: {training_results['confidence_scorer']['accuracy']:.3f}")
    print(f"     - AUC-ROC: {training_results['confidence_scorer']['auc_roc']:.3f}")
    print(f"     - Samples: {training_results['confidence_scorer']['n_samples']}")
    
    print(f"\nTotal Training Time: {total_time:.1f} seconds")
    
    print("\n" + "="*70)
    print("✓ Training complete! All models saved to ./models/")
    print("="*70 + "\n")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
