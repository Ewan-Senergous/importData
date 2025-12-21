// Polyfills globaux pour __dirname et __filename en ES modules
// Doit être défini AVANT tous les imports pour Prisma
globalThis.__dirname ??= '/app';
globalThis.__filename ??= '/app/index.js';

import { env } from '$lib/server/env';

import { handleLogto, UserScope } from '@logto/sveltekit';
import type { Handle } from '@sveltejs/kit';

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
	try {
		// Appliquer le handle Logto
		const response = await logtoHandle({ event, resolve });
		return response;
	} catch (error) {
		console.error('❌ [HOOKS] Erreur dans le handle:', error);
		throw error;
	}
};
