import os
import sys

# Prevent unwanted GPU hangs or TF initialization overhead on CPU-first environments
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")
os.environ.setdefault("USE_TF", "0")
os.environ.setdefault("USE_TORCH", "1")
os.environ.setdefault("TRANSFORMERS_NO_TF", "1")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")

import torch
from contextlib import asynccontextmanager
from typing import List, Optional
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from department_classifier import DepartmentClassifier
from multi_intent_classifier import MultiIntentClassifier

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEPT_MODEL_DIR = os.path.join(BASE_DIR, "department_model")
MULTI_MODEL_DIR = os.path.join(BASE_DIR, "multi_intent_model")

# Global model holders (loaded once at startup)
dept_classifier: Optional[DepartmentClassifier] = None
intent_classifier: Optional[MultiIntentClassifier] = None
device: Optional[torch.device] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global dept_classifier, intent_classifier, device
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[Startup] Initializing ML models on {device}...")
    
    if not os.path.isdir(DEPT_MODEL_DIR):
        raise RuntimeError(f"Department model directory not found: {DEPT_MODEL_DIR}")
    if not os.path.isdir(MULTI_MODEL_DIR):
        raise RuntimeError(f"Multi-intent model directory not found: {MULTI_MODEL_DIR}")

    dept_classifier = DepartmentClassifier(DEPT_MODEL_DIR, device=device)
    intent_classifier = MultiIntentClassifier(MULTI_MODEL_DIR, device=device)
    print("[Startup] All ML models loaded and ready for inference.")
    yield
    print("[Shutdown] Cleaning up ML service resources.")

app = FastAPI(
    title="OneGate ML Microservice",
    description="Local inference microservice for DistilBERT Department & Multi-Intent Classification",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PredictRequest(BaseModel):
    query: str = Field(..., description="The user query or issue description")

class DepartmentPrediction(BaseModel):
    department: str
    confidence: float

class PredictResponse(BaseModel):
    query: str
    department: Optional[str]
    raw_department: str
    department_confidence: float
    department_top_predictions: List[DepartmentPrediction]
    intent_type: str
    intent_confidence: float
    multi_probability: float
    single_probability: float
    multi_threshold: float

@app.get("/")
def read_root():
    return {
        "service": "OneGate ML Inference Microservice",
        "status": "online",
        "docs": "/docs",
        "health": "/health"
    }

@app.get("/health")
def health():
    if dept_classifier is None or intent_classifier is None:
        raise HTTPException(status_code=503, detail="Models not loaded yet")
    return {
        "status": "healthy",
        "service": "OneGate-Python-ML-Service",
        "device": str(device),
        "department_model": f"DistilBERT ({len(dept_classifier.id2label)} classes)",
        "multi_intent_model": "DistilBERT (SINGLE/MULTI)",
        "multi_threshold": 0.60
    }

@app.post("/predict", response_model=PredictResponse)
def predict(payload: PredictRequest):
    clean_query = payload.query.strip() if payload.query else ""
    if not clean_query:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Query string cannot be empty or whitespace only"
        )

    if dept_classifier is None or intent_classifier is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ML models not initialized"
        )

    try:
        dept_result = dept_classifier.predict(clean_query)
        intent_result = intent_classifier.predict(clean_query)

        return PredictResponse(
            query=payload.query,
            department=dept_result["department"],
            raw_department=dept_result["raw_department"],
            department_confidence=dept_result["department_confidence"],
            department_top_predictions=dept_result["department_top_predictions"],
            intent_type=intent_result["intent_type"],
            intent_confidence=intent_result["intent_confidence"],
            multi_probability=intent_result["multi_probability"],
            single_probability=intent_result["single_probability"],
            multi_threshold=intent_result["multi_threshold"]
        )
    except Exception as e:
        print(f"[Predict Error] {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Inference error: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("app:app", host="127.0.0.1", port=port, log_level="info")
