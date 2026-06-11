FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV DEMO_MODE=true
ENV NODE_ENV=production

CMD ["node", "mcp-stdio.js"]
