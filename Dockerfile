# Production Dockerfile for TwitSticker (Node.js + Python + yt-dlp + FFmpeg)
FROM node:20-bookworm-slim

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Install system dependencies: Python3, pip, ffmpeg, curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp for reliable Twitter/X media extraction
RUN pip3 install --no-cache-dir --break-system-packages yt-dlp

# Create app directory
WORKDIR /app

# Copy package manifests and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application source code
COPY . .

# Expose server port
EXPOSE 3000

# Start server
CMD ["node", "server.js"]

