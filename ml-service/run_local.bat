@echo off
REM Quick start script for local development on Windows

echo Starting RoziRakshak ML Microservice...

REM Check if virtual environment exists
if not exist ".venv" (
    echo Creating virtual environment...
    python -m venv .venv
)

REM Activate virtual environment
echo Activating virtual environment...
call .venv\Scripts\activate.bat

REM Install dependencies
echo Installing dependencies...
pip install -r requirements.txt

REM Check if .env exists
if not exist ".env" (
    echo Creating .env from .env.example...
    copy .env.example .env
)

REM Generate synthetic data if not exists
if not exist "data\synthetic_riders.csv" (
    echo Generating synthetic training data...
    python synthetic_data.py
)

REM Start the server
echo Starting FastAPI server on http://localhost:8000
echo API docs available at http://localhost:8000/docs
python main.py
