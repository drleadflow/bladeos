#!/bin/bash
set -e

echo "⚔️  Installing Blade Super Agent..."
echo ""

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "Node.js 20+ required. Install from https://nodejs.org"; exit 1; }
command -v git >/dev/null 2>&1 || { echo "Git required. Install from https://git-scm.com"; exit 1; }

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "Node.js 20+ required. Current: $(node -v)"
  exit 1
fi

# Clone and install
git clone https://github.com/blade-agent/blade-super-agent.git ~/.blade/install
cd ~/.blade/install
npm install
npm run build

# Link CLI globally
npm link -w apps/cli

echo ""
echo "✅ Blade Super Agent installed!"
echo ""
echo "Run 'blade setup' to configure, or just run 'blade' to get started."
