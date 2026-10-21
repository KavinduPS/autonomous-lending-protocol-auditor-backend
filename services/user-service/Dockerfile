FROM node:22-alpine AS build
WORKDIR /app
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
COPY package*.json ./
COPY prisma ./prisma
COPY prisma7.config.ts ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
COPY package*.json ./
COPY prisma ./prisma
COPY prisma7.config.ts ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3001
CMD ["node", "dist/index.js"]