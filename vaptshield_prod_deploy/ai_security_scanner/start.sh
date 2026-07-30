#!/bin/bash
echo "Starting AI Security Scanner..."

# Safely kill existing instances on port 8093
PID=$(lsof -ti:8093)
if [ -n "$PID" ]; then
    echo "Found existing process $PID on port 8093. Terminating gracefully..."
    kill -15 $PID
    sleep 2
    
    # Check if still running
    if kill -0 $PID 2>/dev/null; then
        echo "Process did not terminate. Force killing..."
        kill -9 $PID
    fi
else
    echo "No existing process found on port 8093."
fi

# Start the scanner
echo "Booting FastAPI server..."
nohup python3 main.py > scanner.log 2>&1 &
NEW_PID=$!
echo "Scanner started successfully with PID: $NEW_PID"
