FROM node:20-slim

WORKDIR /app

COPY package*.json .
RUN npm ci

COPY index.html .
COPY tsconfig*.json .
COPY vite.config.ts .
COPY public/ ./public/
COPY src/ ./src/

CMD ["npm", "run", "dev", "--", "--host"]
