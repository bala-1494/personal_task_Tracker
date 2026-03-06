FROM node:20-alpine

# Create app directory
WORKDIR /app

# Install dependencies first (layer-cached unless package.json changes)
COPY package*.json ./
RUN npm ci --only=production

# Copy application source
COPY server.js ./
COPY public ./public

# Cloud Run sets PORT automatically; default to 8080
ENV PORT=8080
EXPOSE 8080

# Run as non-root user for security
USER node

CMD ["node", "server.js"]
