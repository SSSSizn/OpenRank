FROM python:3.9-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python packages
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Clone the repository
RUN git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui.git .

# Expose port for Gradio
EXPOSE 7860

# Set entrypoint
CMD ["python", "launch.py", "--listen"]
