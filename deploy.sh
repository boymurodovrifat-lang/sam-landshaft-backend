#!/usr/bin/env bash
# Sam-Landshaft — VPS deployment script
# Ishlatish: cd ~/apps/sam-landshaft-backend && git pull && ./deploy.sh

set -e

cd "$(dirname "$0")"

echo ">>> Installing dependencies..."
npm install --no-audit --no-fund

echo ">>> Generating Prisma client..."
npx prisma generate

echo ">>> Running migrations..."
npx prisma migrate deploy 2>/dev/null || npx prisma db push --accept-data-loss

echo ">>> Building app (webpack)..."
rm -rf dist
npx nest build --webpack

# Build natijasini tekshirish
if [ ! -f dist/main.js ]; then
  echo "ERROR: dist/main.js topilmadi!"
  echo "Webpack build muvaffaqiyatsiz. Loglarni tekshiring."
  exit 1
fi
echo ">>> Build OK: dist/main.js mavjud"

echo ">>> Ensuring storage folders exist..."
mkdir -p storage/uploads storage/cog storage/videos logs

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
