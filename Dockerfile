# syntax=docker/dockerfile:1.6

# ---------- Base build deps with dev tools ----------
FROM node:20-alpine AS deps
WORKDIR /app
# Install build-time tools (none heavy; keep minimal)
RUN apk add --no-cache python3 make g++

# Only copy package descriptors to leverage layer caching
COPY package.json package-lock.json ./
# Install all deps including dev for building TypeScript
RUN npm ci --include=dev

# ---------- Builder: compile TypeScript ----------
FROM deps AS builder
WORKDIR /app
# Copy project sources
COPY tsconfig.json ./
COPY src ./src
COPY public ./public
# Build to /app/dist
RUN npm run build

# ---------- Production deps (runtime only) ----------
FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
# Install ONLY production deps for a minimal runtime image
RUN npm ci --omit=dev

# ---------- Runtime image ----------
FROM node:20-alpine AS runner
WORKDIR /app
# Install tiny init and curl for healthcheck
RUN apk add --no-cache tini curl

# Copy compiled app and runtime deps
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./

# Security: run as non-root (official image has `node` user)
USER node

# Environment configuration
ENV NODE_ENV=production \
    PORT=3000

# Expose application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://localhost:${PORT}/api-docs" || exit 1

# Proper process management via tini
ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/server.js"]