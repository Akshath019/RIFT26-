# GenMark Frontend — Dockerfile
# ================================
# Multi-stage build:
#   Stage 1 (builder): Node 20 installs deps and runs `vite build` → outputs static files to /app/dist
#   Stage 2 (serve):   nginx serves those static files on port 80
#
# IMPORTANT: VITE_BACKEND_URL must be passed at build time as a build arg.
# Vite BAKES environment variables into the JS bundle at build time.
# You cannot change them at runtime — you must set the build arg when building the image.
#
# Railway usage:
#   Set VITE_BACKEND_URL as a Railway variable → Railway passes it as --build-arg automatically.

# ── Stage 1: Build ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (cached layer)
COPY package*.json ./
RUN npm ci

# Accept backend URL as build argument
ARG VITE_BACKEND_URL=http://localhost:8000
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL

# Copy source and build
COPY . .
RUN npm run build

# ── Stage 2: Serve with nginx ──────────────────────────────────────────────────
FROM nginx:alpine

# Copy built static files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy React Router-compatible nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
