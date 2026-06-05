# WEB-FirmwareServer API
# Build context: monorepo root (k:\PDS-Master-001\)
#
# Paradigm: install and compile entirely inside Docker — matches Railway exactly.
#   No pre-built artifacts needed. Standalone service — no db-central or pds-pipeline deps.

# ── Stage 1: build ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /workspace/web-firmware-server/api

COPY web-firmware-server/api/package*.json ./
COPY web-firmware-server/api/tsconfig.json ./
COPY web-firmware-server/api/src           ./src
RUN npm ci
RUN npm run build

# ── Stage 2: runtime ───────────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /workspace/web-firmware-server/api

COPY --from=builder /workspace/web-firmware-server/api/dist         ./dist
COPY --from=builder /workspace/web-firmware-server/api/package.json ./package.json
COPY --from=builder /workspace/web-firmware-server/api/node_modules ./node_modules

RUN mkdir -p ./storage

EXPOSE 3002
CMD ["node", "dist/index.js"]
