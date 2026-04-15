# Self-Sabotage Builder — container deploy (game + API + Socket.IO on one origin)
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
# Serve index.html, script.js, assets from Express (same URL as /socket.io)
ENV SERVE_STATIC=true

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Render/containers set PORT at runtime
EXPOSE 8080

CMD ["node", "server/index.js"]
