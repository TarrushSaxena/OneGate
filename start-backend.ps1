# Start OneGate Node.js Express + Socket.IO Backend
Write-Host "=================================================" -ForegroundColor Green
Write-Host " Starting OneGate Node.js Backend Server         " -ForegroundColor Green
Write-Host " Port: 3000 (http://localhost:3000)              " -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Green

Set-Location -Path "$PSScriptRoot\backend"
node server.js
