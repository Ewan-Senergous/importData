import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod/v4';
import { env as svelteKitEnv } from '$env/dynamic/private';

/**
 * Validation centralisée des variables d'environnement server-only.
 *
 * ⚠️ NE PAS IMPORTER côté client - Utiliser src/lib/env.client.ts à la place.
 *
 * Variables validées:
 * - DATABASE_URL: Base CENOV principale
 * - CENOV_DEV_DATABASE_URL: Base développement
 * - CENOV_PREPROD_DATABASE_URL: Base pré-production
 * - SECRET_LOGTO_*: Configuration authentification Logto
 * - BODY_SIZE_LIMIT: Limite taille requêtes (défaut: 10MB)
 * - USE_DEV_VIEWS: Utiliser vues dev (défaut: false)
 */
export const env = createEnv({
	server: {
		// Base de données
		DATABASE_URL: z.url({ message: 'DATABASE_URL doit être une URL PostgreSQL valide' }),
		CENOV_DEV_DATABASE_URL: z.url({
			message: 'CENOV_DEV_DATABASE_URL doit être une URL PostgreSQL valide'
		}),
		CENOV_PREPROD_DATABASE_URL: z.url({
			message: 'CENOV_PREPROD_DATABASE_URL doit être une URL PostgreSQL valide'
		}),

		// Authentification Logto
		SECRET_LOGTO_ENDPOINT: z.url({
			message:
				'SECRET_LOGTO_ENDPOINT doit être une URL valide (ex: https://sso.cenov-distribution.com)'
		}),
		SECRET_LOGTO_APP_ID: z.string().min(1, { message: 'SECRET_LOGTO_APP_ID est requis' }),
		SECRET_LOGTO_APP_SECRET: z.string().min(1, { message: 'SECRET_LOGTO_APP_SECRET est requis' }),
		SECRET_LOGTO_COOKIE_ENCRYPTION_KEY: z.string().min(32, {
			message: 'SECRET_LOGTO_COOKIE_ENCRYPTION_KEY doit faire au moins 32 caractères'
		}),
		SECRET_REDIRECT_URI: z.url({ message: 'SECRET_REDIRECT_URI doit être une URL valide' }),
		SECRET_POST_LOGOUT_URI: z.url({ message: 'SECRET_POST_LOGOUT_URI doit être une URL valide' }),

		// Configuration optionnelle avec valeurs par défaut
		BODY_SIZE_LIMIT: z
			.string()
			.default('10000000')
			.transform(Number)
			.pipe(z.number().positive({ message: 'BODY_SIZE_LIMIT doit être un nombre positif' })),

		USE_DEV_VIEWS: z
			.enum(['true', 'false'], { message: 'USE_DEV_VIEWS doit être "true" ou "false"' })
			.default('false')
			.transform((val) => val === 'true'),

		// Logging
		LOG_LEVEL: z
			.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'], {
				message: 'LOG_LEVEL doit être: trace, debug, info, warn, error ou fatal'
			})
			.default('info')
	},

	/**
	 * runtimeEnv: Utiliser $env/dynamic/private de SvelteKit.
	 * SvelteKit expose les variables d'environnement via ce module spécial.
	 * Équivalent à process.env mais compatible avec le système de SvelteKit.
	 */
	runtimeEnv: svelteKitEnv,

	/**
	 * Traiter les chaînes vides comme undefined pour une validation plus stricte.
	 */
	emptyStringAsUndefined: true
});

/**
 * Type inféré pour les variables d'environnement serveur.
 * Utilisable pour typage additionnel si nécessaire.
 */
export type ServerEnv = typeof env;
