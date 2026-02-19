# GenMark Backend — Dockerfile
# ================================
# Python 3.12 slim base.
# Installs system dependencies required by Pillow (JPEG, PNG decoding).
# Runs FastAPI via uvicorn on PORT env var (Railway sets this automatically).

FROM python:3.12-slim

# System deps for Pillow image processing (JPEG + PNG + WebP support)
RUN apt-get update && apt-get install -y \
    libjpeg-dev \
    zlib1g-dev \
    libpng-dev \
    libwebp-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (cached layer — only rebuilds when requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Railway injects $PORT automatically. Fallback to 8000 for local docker run.
EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
