#!/usr/bin/env bash
# Sam-Landshaft — VPS deployment script
# Ishlatish: cd ~/apps/sam-landshaft-backend && git pull && ./deploy.sh

set -euo pipefail

cd "$(dirname "$0")"

echo ">>> Installing dependencies..."
npm ci --no-audit --no-fund

echo ">>> Generating Prisma client..."
npx prisma generate

echo ">>> Building app..."
rm -rf dist
npm run build

# Build natijasini tekshirish
if [ ! -f dist/main.js ]; then
  echo "ERROR: dist/main.js topilmadi!"
  echo "Build muvaffaqiyatsiz. Loglarni tekshiring."
  exit 1
fi
echo ">>> Build OK: dist/main.js mavjud"

echo ">>> Ensuring storage folders exist..."
mkdir -p storage/uploads storage/cog storage/videos logs

echo ">>> Checking required security configuration..."
node -e "require('dotenv').config({ quiet: true }); require('./dist/auth/security-config').requireJwtSecret({ get: key => process.env[key] });"

echo ">>> Running reviewed migrations (failure stops deployment)..."
npx prisma migrate deploy

echo ">>> Restarting PM2..."
if pm2 describe sam-landshaft-api > /dev/null 2>&1; then
  pm2 restart sam-landshaft-api --update-env
else
  pm2 start ./dist/main.js --name sam-landshaft-api
  pm2 save
fi

echo ""
echo ">>> Done! Status:"
pm2 status sam-landshaft-api
echo ""
curl -s http://localhost:3000/api/health || echo "WARNING: Health check failed"
