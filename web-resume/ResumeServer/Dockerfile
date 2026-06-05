# ─── Stage 1: Build React client ─────────────────────────────────────────────
FROM node:22-alpine AS client-builder
WORKDIR /build
COPY client/package*.json ./client/
RUN cd client && npm ci
COPY client/ ./client/
RUN cd client && npm run build

# ─── Stage 2: Production image ───────────────────────────────────────────────
FROM node:22-bookworm-slim

# Install Python3 (ATS scorer — stdlib only, no pip deps)
# Install Pandoc (MD → DOCX)
# Install LibreOffice Writer headless (DOCX → PDF via soffice)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    pandoc \
    libreoffice-writer \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install server dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy server source
COPY server/ ./server/
COPY admin/ ./admin/
COPY chrome-extension/ ./chrome-extension/

# Copy built React client from stage 1
COPY --from=client-builder /build/client/dist ./client/dist

# Runtime userdata is mounted as a volume
VOLUME /app/userdata

EXPOSE 38291

CMD ["node", "server/server.js"]
