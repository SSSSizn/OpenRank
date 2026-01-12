FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "-c", "import tensorflow as tf; print('TensorFlow installed successfully:', tf.__version__)"]