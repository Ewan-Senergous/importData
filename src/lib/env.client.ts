import { createEnv } from '@t3-oss/env-core';
// import { z } from 'zod/v4'; // Décommenter quand vous ajouterez des variables PUBLIC_

/**
 * Validation centralisée des variables d'environnement publiques (client-side).
 *
 * ⚠️ Toutes les variables ici DOIVENT commencer par PUBLIC_
 * ⚠️ Ces variables seront exposées au client et incluses dans le bundle
 *
 * Actuellement vide - Prêt pour ajout futur de variables publiques.
 *
 * @example Ajouter une variable publique:
 * ```typescript
 * import { z } from 'zod/v4'; // Décommenter cette ligne
 *
 * client: {
 *   PUBLIC_API_URL: z.url({ message: "PUBLIC_API_URL doit être une URL valide" }),
 * }
 * ```
 */
export const env = createEnv({
	clientPrefix: 'PUBLIC_',

	client: {
		// Actuellement aucune variable publique
	},

	/**
	 * SvelteKit utilise import.meta.env pour les variables côté client.
	 */
	runtimeEnv: import.meta.env,

	emptyStringAsUndefined: true
});

/**
 * Type inféré pour les variables d'environnement publiques.
 */
export type ClientEnv = typeof env;
