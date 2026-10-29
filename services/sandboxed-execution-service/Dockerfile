FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
COPY prisma7.config.ts ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y curl git bash ca-certificates && rm -rf /var/lib/apt/lists/*
RUN curl -L https://foundry.paradigm.xyz | bash
ENV PATH="/root/.foundry/bin:${PATH}"
RUN foundryup

WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY prisma ./prisma
COPY prisma7.config.ts ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY foundry-template ./foundry-template

EXPOSE 8004
CMD ["node", "dist/index.js"]
