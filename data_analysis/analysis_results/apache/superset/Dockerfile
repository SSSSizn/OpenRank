FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8088

CMD ["gunicorn", "-b", "0.0.0.0:8088", "-w", "4", "superset.app:create_app()"]