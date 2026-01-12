FROM python:3.9-slim

# Install system dependencies required for O3DE Python development
RUN apt-get update && apt-get install -y \
    git \
    build-essential \
    libgl1-mesa-dev \
    libx11-dev \
    libxrandr-dev \
    libxinerama-dev \
    libxcursor-dev \
    libxi-dev \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /o3de

# Copy requirements file
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy O3DE repository (this would typically be done in a multi-stage build)
# COPY . .

# Set environment variables for O3DE
ENV PYTHONPATH=/o3de

# Default command
CMD ["python", "--version"]