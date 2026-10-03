# Sam-Landshaft Backend — Production Dockerfile
# Includes GDAL and FFMPEG for GeoTIFF/video processing

FROM node:22-bookworm-slim AS builder

WORKDIR /app

# System deps for Prisma and native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma

RUN npm ci

COPY tsconfig*.json nest-cli.json ./
COPY src ./src

RUN npx prisma generate
RUN npm run build


FROM node:22-bookworm-slim AS runner

WORKDIR /app

# Install GDAL, FFMPEG, and other runtime deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    gdal-bin \
    ffmpeg \
    openssl \
    tini \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
# Container networking is controlled by the host publish address.
ENV HOST=0.0.0.0

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma

RUN mkdir -p storage/uploads storage/cog storage/videos

EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main"]
