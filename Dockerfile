# Stage 1: build
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
# SECURITY TRADEOFF: disables TLS certificate verification for this npm install only
# (corporate proxy / SSL-inspection environments). Deliberate, documented choice —
# see README.md "Notes". Remove --strict-ssl=false if your build environment doesn't
# require SSL inspection, to restore full certificate verification.
RUN npm ci --strict-ssl=false

COPY . .

# Baked into the JS bundle at build time
ARG VITE_GLPI_URL
ENV VITE_GLPI_URL=$VITE_GLPI_URL

RUN npm run build

# Stage 2: serve
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html

COPY nginx.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80
