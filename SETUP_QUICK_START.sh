#!/bin/bash

# JE Fitness Mobile App - Capacitor Quick Start Script
# Run this script to automate the initial setup process
# Usage: bash SETUP_QUICK_START.sh

set -e

echo "========================================"
echo "JE Fitness - Capacitor Mobile Setup"
echo "========================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo -e "${BLUE}Checking prerequisites...${NC}"

if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js v16+"
    exit 1
fi
echo "✓ Node.js $(node --version)"

if ! command -v npm &> /dev/null; then
    echo "❌ npm not found. Please install npm"
    exit 1
fi
echo "✓ npm $(npm --version)"

if ! command -v java &> /dev/null; then
    echo "❌ Java not found. Please install JDK 11+"
    exit 1
fi
echo "✓ Java installed"

echo ""

# Step 1: Install Capacitor
echo -e "${BLUE}Step 1: Installing Capacitor...${NC}"
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios --save
echo -e "${GREEN}✓ Capacitor installed${NC}"
echo ""

# Step 2: Create www folder
echo -e "${BLUE}Step 2: Creating www folder...${NC}"
if [ ! -d "www" ]; then
    mkdir www
    echo "✓ www folder created"
else
    echo "⚠ www folder already exists"
fi

# Copy public files to www
echo "Copying public files to www..."
cp -r public/* www/
echo -e "${GREEN}✓ Public files copied${NC}"
echo ""

# Step 3: Verify capacitor.config.ts exists
echo -e "${BLUE}Step 3: Verifying Capacitor config...${NC}"
if [ ! -f "capacitor.config.ts" ]; then
    echo "❌ capacitor.config.ts not found"
    echo "Please create capacitor.config.ts at the project root"
    exit 1
fi
echo -e "${GREEN}✓ capacitor.config.ts found${NC}"
echo ""

# Step 4: Initialize Capacitor
echo -e "${BLUE}Step 4: Initializing Capacitor...${NC}"
npx cap init
echo -e "${GREEN}✓ Capacitor initialized${NC}"
echo ""

# Step 5: Add Android platform
echo -e "${BLUE}Step 5: Adding Android platform...${NC}"
npx cap add android
echo -e "${GREEN}✓ Android platform added${NC}"
echo ""

# Step 6: Check for macOS to add iOS
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -e "${BLUE}Step 6: Adding iOS platform...${NC}"
    npx cap add ios
    echo -e "${GREEN}✓ iOS platform added${NC}"
else
    echo -e "${YELLOW}⚠ iOS setup requires macOS. Skipping iOS setup.${NC}"
fi
echo ""

# Step 7: Copy web files to platforms
echo -e "${BLUE}Step 7: Syncing web files to platforms...${NC}"
npx cap sync
echo -e "${GREEN}✓ Web files synced${NC}"
echo ""

# Step 8: Run diagnostics
echo -e "${BLUE}Step 8: Running Capacitor diagnostics...${NC}"
npx cap doctor
echo ""

echo -e "${GREEN}========================================"
echo "✓ Setup Complete!"
echo "========================================${NC}"
echo ""
echo "Next steps:"
echo "1. Update API endpoints in public/js/api.config.js"
echo "2. Update navigation links to use data-route attribute"
echo "3. Convert fetch calls to use API class"
echo "4. Test on Android Emulator:"
echo "   npx cap run android"
echo "5. Test on iOS Simulator (macOS):"
echo "   npx cap run ios"
echo ""
echo "For detailed instructions, see CAPACITOR_MIGRATION_GUIDE.md"
echo ""