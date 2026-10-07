#!/usr/bin/env bash
# Start OneGate Node.js Express + Socket.IO Backend Server
echo "================================================="
echo " Starting OneGate Node.js Backend Server         "
echo " Port: 3000 (http://localhost:3000)              "
echo "================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/backend" || exit 1
node server.js
