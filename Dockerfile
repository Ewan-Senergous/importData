# Dockerfile minimal pour test
FROM node:22-alpine

# Installer pnpm et dépendances système
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate && \
    apk add --no-cache openssl libc6-compat

WORKDIR /app

# Copier tout
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
COPY . .

# Installer et build
RUN pnpm install --frozen-lockfile && \
    pnpm run prisma:generate-all && \
    pnpm run build

# Variables env
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "build/index.js"]
