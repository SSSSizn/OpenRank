FROM python:3.9-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /workspace

# Copy requirements and install Python packages
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install mmdetection from source
RUN git clone https://github.com/open-mmlab/mmdetection.git .
RUN pip install --no-cache-dir -e .

# Set default command
CMD ["/bin/bash"]