FROM python:3.9-slim

WORKDIR /ivy

COPY requirements.txt .

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir -r requirements.txt

COPY . .

RUN python -m pytest tests/ -v --tb=short

CMD ["python", "-c", "import ivy; print('Ivy framework successfully imported')"]