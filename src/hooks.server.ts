// Polyfills globaux pour __dirname et __filename en ES modules
// Doit être défini AVANT tous les imports pour Prisma
globalThis.__dirname ??= '/app';
globalThis.__filename ??= '/app/index.js';

import { env } from '$lib/server/env';
import { createChildLogger } from '$lib/server/logger';

import { handleLogto, UserScope } from '@logto/sveltekit';
import type { Handle } from '@sveltejs/kit';

const httpLogger = createChildLogger('http');

const logtoHandle = handleLogto(
	{
		endpoint: env.SECRET_LOGTO_ENDPOINT,
		appId: env.SECRET_LOGTO_APP_ID,
		appSecret: env.SECRET_LOGTO_APP_SECRET,
		scopes: [UserScope.Email, UserScope.Profile]
	},
	{ encryptionKey: env.SECRET_LOGTO_COOKIE_ENCRYPTION_KEY }
);

export const handle: Handle = async ({ event, resolve }) => {
	// Générer Request ID pour traçabilité (ou récupérer depuis headers)
	const requestId = event.request.headers.get('x-request-id') || crypto.randomUUID();

	// Stocker dans locals pour accès dans routes
	event.locals.requestId = requestId;

	// Log requête entrante (TRACE pour éviter pollution même en DEBUG)
	httpLogger.trace(
		{
			requestId,
			method: event.request.method,
			path: event.url.pathname
		},
		'Incoming request'
	);

	try {
		// Appliquer le handle Logto
		const response = await logtoHandle({ event, resolve });

		// Log succès requête (TRACE pour éviter pollution même en DEBUG)
		httpLogger.trace({ requestId, status: response.status }, 'Request completed');

		return response;
	} catch (error) {
		// Log erreur avec httpLogger
		httpLogger.error(
			{
				requestId,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined
			},
			'Handle error'
		);
		throw error;
	}
};
