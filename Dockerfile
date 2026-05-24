FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV PORT=3000
ENV DEMO_MODE=true
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server.js"]
