FROM python:3.9-slim

WORKDIR /app

# Install system dependencies required by some Python packages
RUN apt-get update && apt-get install -y \
    git \
    tk-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Set default command (adjust based on actual entry point)
CMD ["python", "-c", "print('ArduPilot environment ready')"]
