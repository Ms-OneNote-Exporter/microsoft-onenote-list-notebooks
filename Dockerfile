# Use Node.js LTS Debian image for better compatibility
FROM node:20-slim

# Install Chromium and Playwright dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        chromium \
        ca-certificates \
        fonts-liberation \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libc6 \
        libcairo2 \
        libcups2 \
        libdbus-1-3 \
        libdrm2 \
        libexpat1 \
        libfontconfig1 \
        libgbm1 \
        libgcc1 \
        libglib2.0-0 \
        libgtk-3-0 \
        libnss3 \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libstdc++6 \
        libx11-6 \
        libx11-xcb1 \
        libxcb1 \
        libxcomposite1 \
        libxdamage1 \
        libxext6 \
        libxfixes3 \
        libxrandr2 \
        wget \
        xdg-utils && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install npm dependencies as root (faster builds)
RUN npm install --production

# Copy application source
COPY src/ ./src/
COPY README.md ./

# Copy entrypoint script
COPY entrypoint.sh ./

# Make entrypoint script executable
RUN chmod +x /app/entrypoint.sh

# Create non-root user for security
RUN addgroup --gid 1001 nodejs && \
    adduser --uid 1001 --gid 1001 --disabled-password --gecos "" nodejs

# Switch to non-root user to install Playwright browsers
USER nodejs

# Install Playwright browsers as nodejs user to /home/nodejs/.cache/ms-playwright
RUN npx playwright install chromium --force

# Switch back to root for final setup
USER root

# Set ownership of app directory (including the executable entrypoint)
WORKDIR /app
RUN chown -R nodejs:nodejs /app

# Set environment variable for Playwright cache location
ENV PLAYWRIGHT_BROWSERS_PATH=/home/nodejs/.cache/ms-playwright

# Expose port (if needed for future web interface)
EXPOSE 3000

# Switch to non-root user for runtime
USER nodejs

# Set entrypoint
ENTRYPOINT ["/app/entrypoint.sh"]
