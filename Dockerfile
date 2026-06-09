# Dockerfile for Next.js app
FROM node:22-alpine AS base

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

# Build Next.js
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]
