FROM python:3.9-slim

WORKDIR /app

# Install git for GitPython dependency
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "-c", "print('Container ready for demisto/content workflows')"]