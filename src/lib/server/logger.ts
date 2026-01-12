/**
 * Pino Logger Configuration
 *
 * Logging centralisé pour l'application SvelteKit
 * - Dev: Pretty print colorisé, niveau debug
 * - Prod: JSON structuré, niveau info
 *
 * @example
 * import { logger } from '$lib/server/logger';
 *
 * logger.info({ userId: 123 }, 'User logged in');
 * logger.error({ error }, 'Database error');
 *
 * const childLogger = logger.child({ module: 'export' });
 * childLogger.debug({ tableId: 'kit' }, 'Exporting table');
 */

import pino from 'pino';
import { dev } from '$app/environment';
import { env } from './env';

// Configuration transport conditionnel (pino-pretty en dev uniquement)
const transport = dev
	? {
			target: 'pino-pretty',
			options: {
				colorize: true,
				translateTime: 'SYS:HH:MM:ss',
				ignore: 'pid,hostname',
				singleLine: false,
				messageFormat: '{levelLabel} [{module}] {msg}'
			}
		}
	: undefined;

export const logger = pino({
	level: env.LOG_LEVEL || (dev ? 'debug' : 'info'),
	transport: transport, // En dev: pino-pretty, en prod: undefined (JSON standard)
	timestamp: pino.stdTimeFunctions.isoTime,
	base: undefined, // Pas de champs de base redondants
	formatters: {
		level: (label) => {
			return { level: label };
		}
	}
});

export function createChildLogger(module: string) {
	return logger.child({ module });
}

export type Logger = typeof logger;
