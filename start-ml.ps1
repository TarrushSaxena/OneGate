# Start OneGate Python ML Microservice
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host " Starting OneGate DistilBERT ML Microservice      " -ForegroundColor Cyan
Write-Host " Port: 8000 (http://127.0.0.1:8000)              " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

Set-Location -Path "$PSScriptRoot\backend\ml\python_service"
python -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload
