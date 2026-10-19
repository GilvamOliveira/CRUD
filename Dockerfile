FROM node:24-alpine

WORKDIR /app

COPY . .

ENV PORT=3000
ENV DB_PATH=/data/clientes.db

RUN mkdir -p /data

EXPOSE 3000
VOLUME ["/data"]

CMD ["node", "server/server.js"]
