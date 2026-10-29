FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app


RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

COPY requirements ./requirements
COPY requirements.txt .

RUN --mount=type=cache,target=/root/.cache/pip pip install --default-timeout=1000 --retries 10 -r requirements.txt
ARG EMBEDDING_MODEL=BAAI/bge-small-en-v1.5
ENV HF_HOME=/opt/hf
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('${EMBEDDING_MODEL}')"

COPY app ./app
COPY docs ./docs
COPY alembic ./alembic
COPY alembic.ini ./alembic.ini

RUN useradd -m appuser && chown -R appuser:appuser /app /opt/hf

USER appuser
EXPOSE 8002
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8002"]
