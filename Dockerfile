# Production build
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# Final image
FROM node:20-slim
WORKDIR /app
COPY --from=builder /app /app

# Ensure uploads directory exist with correct permissions
RUN mkdir -p uploads public/avatars && chmod 777 uploads public/avatars

EXPOSE 3000
ENV NODE_ENV=production
CMD ["npm", "start"]
