# Python 3.11 base image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create directories for models and data
RUN mkdir -p models data

# Expose port (Render will set PORT env variable)
EXPOSE 8000

# Run with uvicorn
# Render sets PORT env variable, default to 8000 if not set
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
