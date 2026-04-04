# Render Deployment Guide - RoziRakshak ML Microservice

## Prerequisites
- GitHub repository with ml-service/ folder
- Render account (free tier works)

## Deployment Steps

### 1. Push Code to GitHub
```bash
git add ml-service/
git commit -m "Add ML microservice with all 4 trained models"
git push origin main
```

### 2. Create New Web Service on Render

1. Go to https://dashboard.render.com/
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure the service:

**Basic Settings:**
- **Name**: `rozirakshak-ml-service` (or your preferred name)
- **Region**: Choose closest to your users (e.g., Singapore for India)
- **Branch**: `main`
- **Root Directory**: `ml-service`
- **Runtime**: `Python 3`
- **Python Version**: pinned by `ml-service/.python-version` to `3.11.11`

**Build & Deploy:**
- **Build Command**: 
  ```
  pip install -r requirements.txt
  ```
- **Start Command**: 
  ```
  uvicorn main:app --host 0.0.0.0 --port $PORT
  ```

Optional (slower) build command if you want to retrain models on every deploy:
```
pip install -r requirements.txt && python scripts/train_all.py
```

**Instance Type:**
- Free tier works for development
- Upgrade to Starter ($7/month) for production (recommended for faster model training)

### 3. Environment Variables

Add these in the Render dashboard under "Environment":

```
ENVIRONMENT=production
LOG_LEVEL=INFO
MODELS_DIR=./models
ALLOWED_ORIGINS=https://your-frontend-domain.com,http://localhost:3000
```

**Optional (if using custom model versions):**
```
PREMIUM_MODEL_VERSION=v1
FORECASTING_MODEL_VERSION=v1
FRAUD_MODEL_VERSION=v1
CONFIDENCE_MODEL_VERSION=v1
```

### 4. Deploy

1. Click "Create Web Service"
2. Render will:
  - Install dependencies from requirements.txt
  - Use pre-trained models committed in `ml-service/models/`
  - Start the FastAPI server with uvicorn
3. Wait for deployment to complete (~3-8 minutes for first deploy)

### 5. Verify Deployment

Once deployed, test the health endpoint:

```bash
curl https://your-service-name.onrender.com/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "ml-microservice-api",
  "version": "1.0.0",
  "models": {
    "premium_engine": {"loaded": true, "version": "v1"},
    "forecasting_engine": {"loaded": true, "version": "v1"},
    "fraud_detector": {"loaded": true, "version": "v1"},
    "confidence_scorer": {"loaded": true, "version": "v1"}
  },
  "fallback_available": true
}
```

All 4 models should show `"loaded": true`.

### 6. Test Endpoints

Visit the interactive API docs:
```
https://your-service-name.onrender.com/docs
```

Test each endpoint:
- `POST /premium/quote` - Premium calculation
- `GET /forecast/{zone_id}` - Disruption forecasting
- `POST /fraud/score` - Fraud detection
- `POST /confidence/score` - Confidence scoring

### 7. Share with Team

**Base URL for Cloud Functions integration:**
```
https://your-service-name.onrender.com
```

Share this URL with the Package 4 person (Firebase Cloud Functions) so they can wire up the ML endpoints.

## Monitoring

### Logs
View logs in Render dashboard under "Logs" tab to monitor:
- Model loading at startup
- Request/response logs
- Error messages

### Metrics
Render provides:
- CPU usage
- Memory usage
- Request count
- Response times

## Troubleshooting

### Models Not Loading
- Check build logs for training errors
- Verify all dependencies installed correctly
- Ensure sufficient memory (upgrade instance if needed)

### Slow First Request
- First request after idle may be slow (cold start)
- Upgrade to paid tier to keep service always running

### Training Timeout
- If training takes too long, consider:
  - Pre-training models locally
  - Committing trained models to repo
  - Removing training from build command

### Dependency Build Fails on pandas/scikit-learn/prophet
- This usually means Render picked an unsupported Python version (for example, 3.14).
- Keep `Root Directory` set to `ml-service` so Render reads `ml-service/.python-version`.
- Confirm build logs show Python 3.11.x.
- If needed, set `PYTHON_VERSION=3.11.11` in Render environment variables as an override.

### CORS Issues
- Update `ALLOWED_ORIGINS` environment variable
- Add your frontend domain

## Cost Optimization

**Free Tier:**
- Service spins down after 15 minutes of inactivity
- First request after idle takes ~30 seconds (cold start)
- 750 hours/month free

**Starter Tier ($7/month):**
- Always running (no cold starts)
- Better performance
- Recommended for production

## Updating Models

To retrain models:
1. Push code changes to GitHub
2. Render auto-deploys and reruns training
3. Or manually trigger deploy in Render dashboard

## Security

- Never commit `.env` files
- Use Render environment variables for secrets
- Enable HTTPS (automatic on Render)
- Restrict CORS origins in production

## Support

- Render Docs: https://render.com/docs
- FastAPI Docs: https://fastapi.tiangolo.com/
- Issues: Create GitHub issue in your repo
