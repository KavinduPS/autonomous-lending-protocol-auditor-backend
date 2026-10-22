FROM python:3.14-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SOLC_VERSION=0.8.24

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN python -m pip install --no-cache-dir -r requirements.txt

RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /app/workspaces \
    && chown appuser:appuser /app/workspaces

COPY app ./app

USER appuser

RUN solc-select install 0.8.24 \
    && solc-select use 0.8.24 \
    && solc --version \
    && slither --version

EXPOSE 8001

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]