# Small production image for Cloud Run
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev --no-audit --no-fund; else npm install --omit=dev --no-audit --no-fund; fi && npm cache clean --force
COPY server.js store.js ai.js prompts.js notify.js ./
COPY public ./public
USER node
EXPOSE 8080
CMD ["node", "server.js"]
