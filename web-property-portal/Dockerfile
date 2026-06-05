# ── Builder stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

# Native addons (pg) may need build tools
RUN apk add --no-cache python3 make g++

WORKDIR /workspace

# ── db-central ────────────────────────────────────────────────────────────────
COPY db-central/package*.json          ./db-central/
RUN cd db-central && npm ci

COPY db-central/tsconfig.json          ./db-central/
COPY db-central/src                    ./db-central/src
RUN cd db-central && npm run build

# ── property portal ───────────────────────────────────────────────────────────
COPY web-property-portal/package*.json ./web-property-portal/
RUN cd web-property-portal && npm ci

COPY web-property-portal/tsconfig.json ./web-property-portal/
COPY web-property-portal/src           ./web-property-portal/src
RUN cd web-property-portal && npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /workspace

# db-central compiled output only
COPY --from=builder /workspace/db-central/dist         ./db-central/dist
COPY --from=builder /workspace/db-central/node_modules ./db-central/node_modules

# property portal compiled output + deps
COPY --from=builder /workspace/web-property-portal/dist         ./web-property-portal/dist
COPY --from=builder /workspace/web-property-portal/node_modules ./web-property-portal/node_modules
COPY --from=builder /workspace/web-property-portal/package.json ./web-property-portal/package.json

WORKDIR /workspace/web-property-portal

EXPOSE 3003
CMD ["node", "dist/index.js"]
