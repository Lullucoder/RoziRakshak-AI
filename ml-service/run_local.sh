#!/bin/bash
# Quick start script for local development

echo "🚀 Starting RoziRakshak ML Microservice..."

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv .venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source .venv/bin/activate

# Install dependencies
echo "📥 Installing dependencies..."
pip install -r requirements.txt

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚙️  Creating .env from .env.example..."
    cp .env.example .env
fi

# Generate synthetic data if not exists
if [ ! -f "data/synthetic_riders.csv" ]; then
    echo "📊 Generating synthetic training data..."
    python synthetic_data.py
fi

# Start the server
echo "✅ Starting FastAPI server on http://localhost:8000"
echo "📖 API docs available at http://localhost:8000/docs"
python main.py
