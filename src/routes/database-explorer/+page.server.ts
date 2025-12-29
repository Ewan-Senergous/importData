import { fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getAllDatabaseTables, getTableMetadata, type DatabaseName } from '$lib/prisma-meta';
import {
	getTableData,
	createTableRecord,
	updateTableRecord,
	deleteTableRecord
} from './repositories/explorer.repository';
import { parseValueForDatabase } from './services/explorer.service';
import { generateZodSchema, generateUpdateSchema } from './services/schema-generator.service';

/**
 * Charger toutes les tables des trois bases de données
 */
export const load: PageServerLoad = async () => {
	const allTables = await getAllDatabaseTables();
	return { allTables };
};

/**
 * Actions CRUD pour les tables
 */
export const actions: Actions = {
	/**
	 * Charger les données d'une table
	 */
	loadTable: async ({ request }) => {
		const formData = await request.formData();
		const database = formData.get('database') as DatabaseName;
		const tableName = formData.get('tableName') as string;
		const page = Number.parseInt(formData.get('page') as string, 10) || 1;

		try {
			const result = await getTableData(database, tableName, { page, limit: 500 });
			return {
				success: true,
				data: result.data,
				total: result.total,
				metadata: result.metadata
			};
		} catch (error) {
			console.error('Erreur lors du chargement de la table:', error);
			return fail(500, {
				success: false,
				error: 'Erreur lors du chargement de la table'
			});
		}
	},

	/**
	 * Créer un nouvel enregistrement
	 */
	create: async ({ request }) => {
		const formData = await request.formData();
		const database = formData.get('database') as DatabaseName;
		const tableName = formData.get('tableName') as string;

		try {
			// Récupérer les métadonnées de la table
			const metadata = await getTableMetadata(database, tableName);

			if (!metadata) {
				return fail(404, {
					success: false,
					error: `Table ${tableName} introuvable dans la base ${database}`
				});
			}

			// Générer le schéma Zod
			const schema = generateZodSchema(metadata);

			// Parser les données du formulaire
			const data: Record<string, unknown> = {};
			for (const field of metadata.fields) {
				if (field.isPrimaryKey) continue;

				const value = formData.get(field.name) as string;
				if (value !== null) {
					data[field.name] = parseValueForDatabase(value, field);
				}
			}

			// Valider les données
			const validation = schema.safeParse(data);
			if (!validation.success) {
				return fail(400, {
					success: false,
					error: 'Erreur de validation',
					errors: validation.error.issues
				});
			}

			// Créer l'enregistrement
			await createTableRecord(database, tableName, validation.data);

			return {
				success: true,
				message: 'Enregistrement créé avec succès'
			};
		} catch (error) {
			console.error('Erreur lors de la création:', error);
			return fail(500, {
				success: false,
				error: 'Erreur lors de la création de l\'enregistrement'
			});
		}
	},

	/**
	 * Modifier un enregistrement existant
	 */
	update: async ({ request }) => {
		const formData = await request.formData();
		const database = formData.get('database') as DatabaseName;
		const tableName = formData.get('tableName') as string;
		const primaryKeyValue = formData.get('primaryKeyValue');

		try {
			// Récupérer les métadonnées de la table
			const metadata = await getTableMetadata(database, tableName);

			if (!metadata) {
				return fail(404, {
					success: false,
					error: `Table ${tableName} introuvable dans la base ${database}`
				});
			}

			// Générer le schéma Zod pour update (tous champs optionnels)
			const schema = generateUpdateSchema(metadata);

			// Parser les données du formulaire
			const data: Record<string, unknown> = {};
			for (const field of metadata.fields) {
				if (field.isPrimaryKey) continue;

				const value = formData.get(field.name) as string;
				if (value !== null && value !== undefined) {
					data[field.name] = parseValueForDatabase(value, field);
				}
			}

			// Valider les données
			const validation = schema.safeParse(data);
			if (!validation.success) {
				return fail(400, {
					success: false,
					error: 'Erreur de validation',
					errors: validation.error.issues
				});
			}

			// Modifier l'enregistrement
			await updateTableRecord(database, tableName, primaryKeyValue, validation.data);

			return {
				success: true,
				message: 'Enregistrement modifié avec succès'
			};
		} catch (error) {
			console.error('Erreur lors de la modification:', error);
			return fail(500, {
				success: false,
				error: 'Erreur lors de la modification de l\'enregistrement'
			});
		}
	},

	/**
	 * Supprimer un enregistrement
	 */
	delete: async ({ request }) => {
		const formData = await request.formData();
		const database = formData.get('database') as DatabaseName;
		const tableName = formData.get('tableName') as string;
		const primaryKeyValue = formData.get('primaryKeyValue');
		const confirmation = formData.get('confirmation') as string;

		// Vérifier la confirmation
		if (confirmation !== 'SUPPRIMER') {
			return fail(400, {
				success: false,
				error: 'Confirmation invalide. Veuillez taper "SUPPRIMER"'
			});
		}

		try {
			// Supprimer l'enregistrement
			await deleteTableRecord(database, tableName, primaryKeyValue);

			return {
				success: true,
				message: 'Enregistrement supprimé avec succès'
			};
		} catch (error) {
			console.error('Erreur lors de la suppression:', error);
			return fail(500, {
				success: false,
				error: 'Erreur lors de la suppression de l\'enregistrement'
			});
		}
	}
};