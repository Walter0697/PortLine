#!/bin/bash

# Development script for PortLine

echo "🐳 PortLine - Development Mode"
echo "================================"

# Check if Go is installed
if ! command -v go &> /dev/null; then
    echo "❌ Go is not installed. Please install Go 1.21 or later."
    exit 1
fi

# Download dependencies
echo "📦 Downloading dependencies..."
go mod download

# Run the application
echo "🚀 Starting server on http://localhost:8080"
echo "📝 Press Ctrl+C to stop"
echo ""

go run .
