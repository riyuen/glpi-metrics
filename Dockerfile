# Stage 1: build
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Tokens are baked into the JS bundle at build time
ARG VITE_GLPI_APP_TOKEN
ARG VITE_GLPI_USER_TOKEN
ENV VITE_GLPI_APP_TOKEN=$VITE_GLPI_APP_TOKEN
ENV VITE_GLPI_USER_TOKEN=$VITE_GLPI_USER_TOKEN

RUN npm run build

# Stage 2: serve
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# nginx template — GLPI_URL is substituted at container start
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80
