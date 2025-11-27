# Dockerfile pour Prisma 7 + SvelteKit + pnpm
# Prisma 7 nécessite Node.js 20.19+ ou 22.12+ ou 24.0+

# Stage 1: Build
FROM node:22.12-alpine AS builder

# Installer pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Installer dépendances système pour Prisma
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Copier fichiers de dépendances
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma

# Installer dépendances
RUN pnpm install --frozen-lockfile

# Copier le reste du code
COPY . .

# Générer clients Prisma
RUN pnpm run prisma:generate-all

# Build SvelteKit
RUN pnpm run build

# Stage 2: Production
FROM node:22.12-alpine AS runner

# Installer openssl pour Prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Copier node_modules et build depuis builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/prisma ./prisma

# Variables d'environnement (valeurs par défaut)
ENV NODE_ENV=production
ENV PORT=3000

# Exposer le port
EXPOSE 3000

# Healthcheck pour vérifier que l'app fonctionne
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Lancer l'application (adapter-node génère build/index.js)
CMD ["node", "build/index.js"]
