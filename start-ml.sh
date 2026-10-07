#!/usr/bin/env bash
# Start OneGate Python DistilBERT ML Microservice
echo "================================================="
echo " Starting OneGate DistilBERT ML Microservice      "
echo " Port: 8000 (http://127.0.0.1:8000)              "
echo "================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/backend/ml/python_service" || exit 1
python3 -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload
