# Start OneGate Full Stack (Node.js Backend + Python ML Microservice)
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host " Starting OneGate Enterprise Platform            " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

# Launch ML Service in separate PowerShell window
Start-Process powershell -ArgumentList "-NoExit", "-File", "$PSScriptRoot\start-ml.ps1"
Write-Host " [✓] Launched DistilBERT ML Service on http://127.0.0.1:8000" -ForegroundColor Green

# Launch Backend in current window
Write-Host " [✓] Launching Node.js Backend Server on http://localhost:3000" -ForegroundColor Green
& "$PSScriptRoot\start-backend.ps1"
