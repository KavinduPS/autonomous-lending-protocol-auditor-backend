from fastapi import FastAPI

app = FastAPI()


@app.get("/health")
def health():
    return {"service": "static-analysis-service", "status": "ok"}
