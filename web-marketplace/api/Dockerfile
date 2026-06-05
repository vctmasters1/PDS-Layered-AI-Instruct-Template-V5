# WEB-Marketplace API
# Build context: monorepo root (k:\PDS-Master-001\)
#
# Paradigm: install and compile entirely inside Docker — matches Railway exactly.
#   No pre-built artifacts needed. Native addons (bcrypt, sharp) compile on Linux.
#   Directory layout mirrors the monorepo so module-alias @db-central paths resolve:
#     /workspace/db-central/dist/
#     /workspace/web-marketplace/api/dist/       ← __dirname at runtime
#     /workspace/web-marketplace/frontend/dist/  ← SPA, path.join(__dirname, '../../frontend/dist')

# ── Stage 1: build ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
RUN apk add --no-cache python3 make g++

WORKDIR /workspace

# db-central: install + compile first (Marketplace references it via tsconfig project ref)
COPY db-central/package*.json ./db-central/
COPY db-central/tsconfig.json ./db-central/
COPY db-central/src           ./db-central/src
RUN cd db-central && npm ci
RUN cd db-central && npm run build

# Marketplace API: install (bcrypt + sharp compile natively on Linux here) + compile
COPY web-marketplace/api/package*.json ./web-marketplace/api/
COPY web-marketplace/api/tsconfig.json ./web-marketplace/api/
COPY web-marketplace/api/src           ./web-marketplace/api/src
RUN cd web-marketplace/api && npm ci
RUN cd web-marketplace/api && npm run build

# Marketplace frontend: install + Vite build
# BASE_PATH tells Vite to prefix all asset URLs with /marketplace/ so they
# resolve correctly when served behind the nginx gateway.
COPY web-marketplace/frontend/package*.json  ./web-marketplace/frontend/
COPY web-marketplace/frontend/tsconfig.json  ./web-marketplace/frontend/
COPY web-marketplace/frontend/vite.config.js ./web-marketplace/frontend/
COPY web-marketplace/frontend/index.html     ./web-marketplace/frontend/
COPY web-marketplace/frontend/src            ./web-marketplace/frontend/src
# VITE_API_BASE routes API calls to /marketplace/api/v1/... via nginx gateway
RUN cd web-marketplace/frontend && npm ci && BASE_PATH=/marketplace/ VITE_API_BASE=/marketplace/api npm run build

# ── Stage 2: runtime ────────────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /workspace

# db-central: only dist + node_modules needed at runtime
COPY --from=builder /workspace/db-central/dist         ./db-central/dist
COPY --from=builder /workspace/db-central/node_modules ./db-central/node_modules

# Marketplace API: dist, package.json (for module-alias), node_modules (native addons compiled for Linux)
COPY --from=builder /workspace/web-marketplace/api/dist         ./web-marketplace/api/dist
COPY --from=builder /workspace/web-marketplace/api/package.json ./web-marketplace/api/package.json
COPY --from=builder /workspace/web-marketplace/api/node_modules ./web-marketplace/api/node_modules

# React SPA (served as static files by Express)
COPY --from=builder /workspace/web-marketplace/frontend/dist ./web-marketplace/frontend/dist

# uploads directory (persisted via Docker volume in compose)
RUN mkdir -p /workspace/web-marketplace/api/uploads

WORKDIR /workspace/web-marketplace/api
EXPOSE 3000
CMD ["node", "dist/index.js"]
