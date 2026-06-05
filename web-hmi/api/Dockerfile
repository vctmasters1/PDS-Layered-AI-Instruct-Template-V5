# WEB-HMI API
# Build context: monorepo root (k:\PDS-Master-001\)
#
# Paradigm: install and compile entirely inside Docker — matches Railway exactly.
#   No pre-built artifacts needed. All native addons (bcrypt) compile on Linux.
#   Directory layout mirrors the monorepo so module-alias @db-central paths resolve:
#     /workspace/db-central/dist/
#     /workspace/web-hmi/api/dist/     ← __dirname at runtime
#     /workspace/web-hmi/dist/         ← React SPA, path.join(__dirname, '../../dist')

# ── Stage 1: build ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
RUN apk add --no-cache python3 make g++

WORKDIR /workspace

# pds-pipeline: install + compile first (HMI depends on it via file: dep)
COPY pds-pipeline/package*.json ./pds-pipeline/
COPY pds-pipeline/tsconfig.json ./pds-pipeline/
COPY pds-pipeline/src          ./pds-pipeline/src
RUN cd pds-pipeline && npm ci
RUN cd pds-pipeline && npm run build

# db-central: install + compile first (HMI references it via tsconfig project ref)
COPY db-central/package*.json ./db-central/
COPY db-central/tsconfig.json ./db-central/
COPY db-central/src           ./db-central/src
RUN cd db-central && npm ci
RUN cd db-central && npm run build

# HMI API: install (resolves file:../../pds-pipeline symlink cleanly on Linux) + compile
COPY web-hmi/api/package*.json ./web-hmi/api/
COPY web-hmi/api/tsconfig.json ./web-hmi/api/
COPY web-hmi/api/src           ./web-hmi/api/src
RUN cd web-hmi/api && npm ci
RUN cd web-hmi/api && npm run build

# HMI React frontend: install + Vite build (needs postcss + tailwind configs)
# VITE_BASE_PATH sets asset URL prefix; VITE_API_PREFIX routes API calls to /hmi/api/v1/... via nginx
COPY web-hmi/package*.json       ./web-hmi/
COPY web-hmi/tsconfig.json       ./web-hmi/
COPY web-hmi/vite.config.ts      ./web-hmi/
COPY web-hmi/postcss.config.cjs  ./web-hmi/
COPY web-hmi/tailwind.config.ts  ./web-hmi/
COPY web-hmi/index.html          ./web-hmi/
COPY web-hmi/src                 ./web-hmi/src
RUN cd web-hmi && npm ci && VITE_BASE_PATH=/hmi/ VITE_API_PREFIX=/hmi/api npm run build

# ── Stage 2: runtime ────────────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /workspace

# pds-pipeline: npm ci on Linux installs file: deps as symlinks, so COPY --from=builder
# copies the symlink but not the target. Copy the built package explicitly.
COPY --from=builder /workspace/pds-pipeline/dist         ./pds-pipeline/dist
COPY --from=builder /workspace/pds-pipeline/package.json ./pds-pipeline/package.json

# db-central: only dist + node_modules needed at runtime
COPY --from=builder /workspace/db-central/dist         ./db-central/dist
COPY --from=builder /workspace/db-central/node_modules ./db-central/node_modules

# HMI API: dist, package.json (for module-alias), node_modules (bcrypt compiled for Linux)
COPY --from=builder /workspace/web-hmi/api/dist         ./web-hmi/api/dist
COPY --from=builder /workspace/web-hmi/api/package.json ./web-hmi/api/package.json
COPY --from=builder /workspace/web-hmi/api/node_modules ./web-hmi/api/node_modules

# React SPA (served as static files by Express)
COPY --from=builder /workspace/web-hmi/dist ./web-hmi/dist

WORKDIR /workspace/web-hmi/api
EXPOSE 3001
CMD ["node", "dist/index.js"]
