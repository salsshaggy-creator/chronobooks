# Single-service build: the frontend is built in its own stage, then its static output
# is copied into the backend image at backend/frontend/ -- one Node process ends up
# serving both the API (/api/*) and the app itself (everything else) on one origin, one
# Railway service, matching the ChronoSync deployment pattern (a separate Postgres
# service is added alongside this one in Railway, not part of this image).

# ---- stage 1: build the frontend ----
FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- stage 2: backend + the built frontend ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/ ./
COPY --from=frontend-build /app/frontend/dist ./frontend

EXPOSE 8080
CMD ["node", "src/server.js"]
