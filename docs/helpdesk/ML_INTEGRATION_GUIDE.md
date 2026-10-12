# One Front Door / OneGate — ML & Backend Architecture Guide

## 1. System Architecture

```
                       Frontend (Vanilla JS + Liquid Glass UI)
                                        │
                                        ▼ HTTP / Socket.IO
                      Node.js / Express Server (Port 3000)
                                        │
                                        ▼
                           services/orchestrator.js
                                        │
                    ┌───────────────────┴───────────────────┐
                    │                                       │
                    ▼                                       ▼
       Python ML Microservice (FastAPI, Port 8000)      Existing Core Services
        ├── DistilBERT Department Classifier (13 classes) ├── PII Redaction & Guardrails
        └── DistilBERT Multi-Intent Classifier (0.60 gate)├── TF-IDF KB Engine (60 articles)
                    │                                       ├── zenmux LLM RAG Generator
                    │ (JSON Bridge / Timeout Protected)     ├── Priority & SLA Calculator
                    ▼                                       └── Weighted Assignment Engine
          Node ML Bridge (mlBridge.js)
                    │
                    ▼ [Canonical Mapping & Fallback Gate]
      ┌─────────────┴─────────────┐
      │ Supported Dept            │ Unsupported / Error
      ▼                           ▼
DistilBERT Used           Naive Bayes Fallback
      │                           │
      └─────────────┬─────────────┘
                    │
                    ▼
          Confidence & Intent Gate
      ┌─────────────┼─────────────────────────┐
      │ High Conf   │ Medium Conf             │ Multi-Intent OR Low Conf
      │ + KB Match  │                         │ 
      ▼             ▼                         ▼
   LLM + Citation  Clarifying Question     Human Specialist Ticket
   (Deflection)                            (Guaranteed Handoff)
```

---

## 2. Why Node.js & Python Are Decoupled

- **Node.js (Core Application Tier)**: Retains all enterprise ticketing, real-time Socket.IO events, SLA timers (5s tick loop), multi-factor assignment scoring, employee dashboard, and data models. Node excels at high-concurrency event loops, web sockets, and I/O.
- **Python (ML Microservice Tier)**: Dedicated PyTorch / Hugging Face runtime (`transformers`, `safetensors`). Python handles transformer tensor operations and forward passes on CPU without blocking the Node event loop.
- **Fault-Tolerant Resilience**: If the Python service is offline, upgrading, or times out, Node.js automatically falls back to its internal multinomial Naive Bayes classifier. **The application never crashes.**

---

## 3. Model Storage Locations

Both pre-trained DistilBERT models are located locally:
- **Department Classifier**: `backend/ml/python_service/department_model/`
  - Model architecture: `DistilBertForSequenceClassification`
  - Class count: 13 domain classes
  - Config: `config.json`, weights: `model.safetensors`
- **Multi-Intent Classifier**: `backend/ml/python_service/multi_intent_model/`
  - Model architecture: `DistilBertForSequenceClassification`
  - Classes: `SINGLE` (0), `MULTI` (1)
  - Threshold: Frozen at `0.60`
  - Config: `config.json`, weights: `model.safetensors`

*Note: Models are loaded ONCE into memory at microservice startup via FastAPI lifespan.*

---

## 4. How to Install Python Dependencies

```powershell
cd PS18_App/backend/ml/python_service
pip install -r requirements.txt
```

Core dependencies in `requirements.txt`:
- `fastapi>=0.100.0`
- `uvicorn>=0.20.0`
- `torch>=2.0.0`
- `transformers>=4.30.0`
- `safetensors>=0.3.0`
- `pydantic>=2.0.0`

---

## 5. How to Start the Services

### Terminal 1: Python ML Microservice (Port 8000)
```powershell
cd PS18_App/backend/ml/python_service
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```
*Or using the PowerShell helper from root:*
```powershell
.\start-ml.ps1
```

### Terminal 2: Node.js Backend Server (Port 3000)
```powershell
cd PS18_App/backend
node server.js
```
*Or using the PowerShell helper from root:*
```powershell
.\start-backend.ps1
```

Verify Python ML Service:
```bash
curl http://127.0.0.1:8000/health
```

---

## 6. Microservice API (`/predict`)

**Endpoint**: `POST http://127.0.0.1:8000/predict`  
**Payload**:
```json
{
  "query": "My VPN is not connecting"
}
```

**Response**:
```json
{
  "query": "My VPN is not connecting",
  "department": "IT",
  "raw_department": "IT Support",
  "department_confidence": 0.8583,
  "department_top_predictions": [
    { "department": "IT Support", "confidence": 0.8583 },
    { "department": "Cybersecurity", "confidence": 0.0256 },
    { "department": "HR", "confidence": 0.0162 }
  ],
  "intent_type": "SINGLE",
  "intent_confidence": 0.4059,
  "multi_probability": 0.5941,
  "single_probability": 0.4059,
  "multi_threshold": 0.60
}
```

---

## 7. Label Normalization & Canonical Mapping

The DistilBERT model was trained on 13 classes. The Node application core routing and employee taxonomy operate on `IT`, `HR`, `Finance`, and `Facilities`.

Mapping logic in `department_classifier.py`:
- `IT Support` -> `IT`
- `Cybersecurity` -> `IT` (Sub-discipline verified by KB security articles and L2 engineer skill tags)
- `HR` -> `HR`
- `Finance` -> `Finance`
- `Billing` -> `Finance` (Sub-discipline verified by accounts payable and fake-data ticketing)
- `Facilities` -> `Facilities`
- **Unsupported classes** (`Customer Support`, `Data & Analytics`, `Investor Relations`, `Legal`, `Marketing`, `Quality Assurance`, `Out of Scope`, `Unknown`):
  - Preserves `raw_department`.
  - Canonical `department` set to `None`.
  - Node orchestrator detects unmapped department and invokes the legacy Naive Bayes classifier, logging:
    `[ML] DistilBERT predicted unsupported department "${raw_department}", falling back to Naive Bayes`.

---

## 8. Multi-Intent Routing Gate

- Multi-intent threshold is frozen at: **`0.60`**
- If `multi_probability >= 0.60` -> `intent_type = "MULTI"`.
- **MVP Guardrail**: OneGate does not guess or return partial answers that address only one clause of a compound issue.
- **Routing**: `MULTI` queries are automatically routed to a human specialist ticket with a warm handoff message:
  *"I noticed your request involves multiple topics across different domains. To ensure every part of your issue is properly handled without missing anything, I'm routing this to a support specialist for coordination."*

---

## 9. Confidence Gate & KB Grounding

Confidence constants in `orchestrator.js`:
- `ML_HIGH_CONFIDENCE = 0.70`
- `ML_MEDIUM_CONFIDENCE = 0.45`
- `MULTI_INTENT_THRESHOLD = 0.60`

### Decision Matrix:
| Trigger / Confidence | KB Evidence | Action | Resulting Behavior |
| :--- | :--- | :--- | :--- |
| Sensitive Request (Password, Salary) | N/A | `verify` | 2FA / Employee ID Verification |
| Multi-Intent (`multi_prob >= 0.60`) | N/A | `ticket` | Human Handoff (Unified ticket) |
| Explicit Human Request / Emergency | N/A | `ticket` | Human Handoff (L2/L3 Assignment) |
| High (`conf >= 0.70`) | Score >= 0.08 | `answer` | Grounded LLM + Exact Citation |
| High (`conf >= 0.70`) | No match | `ticket` | Specialist Ticket (KB grounding mandatory) |
| Medium (`0.45 <= conf < 0.70`) | Score < 0.28 | `clarify` | Exactly 1 Clarification Question |
| Low (`conf < 0.45`) | N/A | `ticket` | Low-confidence Specialist Handoff |

---

## 10. Fallback Resilience Verification

- When Python is online:
  `[ML] DistilBERT prediction used: IT (raw: IT Support, conf: 85.8%)`
- When Python is stopped or unreachable:
  `[ML] DistilBERT unavailable, using Naive Bayes fallback: ML service unavailable: fetch failed`
  Node continues operating with zero downtime, responding within milliseconds.

---

## 11. Hackathon Viva & Demo Talking Points

1. **Enterprise Two-Tier AI Architecture**:
   *"We decoupled compute-heavy transformer inference (Python / PyTorch) from high-throughput enterprise business workflows (Node.js Express + Socket.IO). This keeps UI latency low and provides industrial-grade resilience."*
2. **Deflection-First RAG Grounding**:
   *"Our confidence gate mandates policy verification before deflecting. Even a 99% confident classifier is NOT permitted to hallucinate an answer without an authentic knowledge base citation (e.g. IT Policy §3.2)."*
3. **Compound Intent Safety**:
   *"Rather than naively splitting queries or answering only half a compound problem, our binary DistilBERT classifier detects multi-intent at 0.60 threshold and transparently hands off to human agents without losing context."*
4. **Zero Dead-End Guarantee**:
   *"Every user interaction leads to an authoritative answer, an intelligent clarification, or an SLA-backed ticket with live queue tracking and warm specialist briefings."*
