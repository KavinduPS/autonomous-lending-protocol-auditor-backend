from fastapi import FastAPI
app = FastAPI()
@app.get("/health")
def health():
 return {"service": "sandboxed-execution-service", "status": "ok"}