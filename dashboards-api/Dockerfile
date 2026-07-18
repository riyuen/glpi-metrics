FROM node:20-alpine

WORKDIR /app
COPY server.js .

ENV DATA_DIR=/data
ENV PORT=3001
EXPOSE 3001

CMD ["node", "server.js"]
