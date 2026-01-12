FROM python:3.9-slim

# Set working directory
WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install system dependencies for Flutter development
RUN apt-get update && apt-get install -y \
    curl \
    unzip \
    git \
    xz-utils \
    && rm -rf /var/lib/apt/lists/*

# Install Flutter SDK
RUN git clone https://github.com/flutter/flutter.git /usr/local/flutter
ENV PATH="\$PATH:/usr/local/flutter/bin"

# Pre-download Flutter dependencies
RUN flutter precache

# Copy application code
COPY . .

# Set default command
CMD ["python", "-c", "print('Flutter DevOps environment ready')"]