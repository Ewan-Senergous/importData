// src/lib/server/db.ts
import { PrismaClient } from '../../generated/prisma-cenov/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { dev } from '$app/environment';
import { env } from './env';

// Créer l'adapter PostgreSQL pour Prisma 7
const adapter = new PrismaPg({
	connectionString: env.DATABASE_URL
});

// Créer le client Prisma avec l'adapter
const prisma = new PrismaClient({
	adapter,
	log: ['error', 'warn'],
	errorFormat: 'pretty'
});

// Fonction helper pour déterminer l'environnement
function useDevTables() {
	return env.USE_DEV_VIEWS || dev;
}

// Export du client Prisma et fonction helper
export { prisma, useDevTables };
