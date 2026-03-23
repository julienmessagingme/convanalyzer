#!/bin/bash
# =============================================================================
# Mieux Assure - Deployment Script
# =============================================================================
#
# Usage:
#   ./deploy.sh              # Deploy production
#   ./deploy.sh --staging    # Deploy staging
#
# Prerequisites:
#   - Docker and Docker Compose installed
#   - .env.production (or .env.staging) file configured
#   - Git repository cloned on the server
#
# =============================================================================

set -e

# Parse arguments
COMPOSE_FILE="docker-compose.yml"
ENV_LABEL="production"
PORT=3000

if [[ "$1" == "--staging" ]]; then
    COMPOSE_FILE="docker-compose.staging.yml"
    ENV_LABEL="staging"
    PORT=3001
fi

echo "========================================="
echo " Deploying Mieux Assure ($ENV_LABEL)"
echo "========================================="

# Pull latest code
echo "[1/4] Pulling latest code..."
git pull origin master

# Stop existing container
echo "[2/4] Stopping existing container..."
docker compose -f "$COMPOSE_FILE" down

# Build fresh image
echo "[3/4] Building Docker image (no cache)..."
docker compose -f "$COMPOSE_FILE" build --no-cache

# Start container
echo "[4/4] Starting container..."
docker compose -f "$COMPOSE_FILE" up -d

# Health check
echo ""
echo "Waiting 10 seconds for startup..."
sleep 10

if curl -sf "http://127.0.0.1:${PORT}/analyze/api/workspaces" > /dev/null 2>&1; then
    echo "Deploy successful! Container is healthy."
else
    echo "WARNING: Health check failed. Check logs with:"
    echo "  docker compose -f $COMPOSE_FILE logs --tail 50"
fi

echo ""
echo "========================================="
echo " Deployment complete ($ENV_LABEL)"
echo "========================================="
