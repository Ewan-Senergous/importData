import { json } from '@sveltejs/kit';
import { updateTableRecord } from '../../repositories/explorer.repository';
import type { DatabaseName } from '$lib/prisma-meta';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { database, schema, tableName, primaryKeyValue, fieldName, newValue } =
			await request.json();

		// Validation des paramètres
		if (!database || !tableName || primaryKeyValue === undefined || !fieldName) {
			return json({ success: false, error: 'Paramètres manquants' }, { status: 400 });
		}

		// Validation anti-injection
		if (!/^[a-z_][a-z0-9_]*$/i.test(tableName)) {
			return json({ success: false, error: 'Nom de table invalide' }, { status: 400 });
		}

		if (!/^[a-z_][a-z0-9_]*$/i.test(fieldName)) {
			return json({ success: false, error: 'Nom de champ invalide' }, { status: 400 });
		}

		if (schema && !/^[a-z_][a-z0-9_]*$/i.test(schema)) {
			return json({ success: false, error: 'Nom de schéma invalide' }, { status: 400 });
		}

		// Mettre à jour uniquement ce champ
		await updateTableRecord(
			database as DatabaseName,
			tableName,
			primaryKeyValue,
			{
				[fieldName]: newValue
			},
			schema || 'public'
		);

		return json({ success: true });
	} catch (error) {
		console.error('❌ Erreur update-cell:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Erreur lors de la mise à jour'
			},
			{ status: 500 }
		);
	}
};
