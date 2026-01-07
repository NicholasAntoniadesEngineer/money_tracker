#!/bin/bash
# Simple local web server for testing Money Tracker

PORT=8000

echo "======================================"
echo "  Money Tracker Local Server"
echo "======================================"
echo ""
echo "Starting server on http://localhost:$PORT"
echo ""
echo "Open in browser:"
echo "  Main app:     http://localhost:$PORT/ui/index.html"
echo "  Monthly:      http://localhost:$PORT/monthlyBudget/views/monthlyBudget.html"
echo "  Messenger:    http://localhost:$PORT/messaging/views/messenger.html"
echo ""
echo "Press Ctrl+C to stop"
echo "======================================"
echo ""

# Try Python 3 first, then Python 2, then Node.js
if command -v python3 &> /dev/null; then
    python3 -m http.server $PORT
elif command -v python &> /dev/null; then
    python -m SimpleHTTPServer $PORT
elif command -v npx &> /dev/null; then
    npx http-server -p $PORT
else
    echo "Error: No server available. Install Python or Node.js"
    exit 1
fi
