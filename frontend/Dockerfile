# ── Build ───────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Producción con Nginx ─────────────────────────────────────
FROM nginx:alpine AS production
COPY --from=builder /app/dist/microfin-frontend/browser /usr/share/nginx/html
COPY nginx-app.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
