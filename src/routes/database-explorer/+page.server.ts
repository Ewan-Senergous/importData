import { fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getClient, type DatabaseName } from '$lib/prisma-meta';
import {
	getAllDatabaseTablesFromPostgres,
	getTableMetadataFromPostgres
} from '$lib/postgres-metadata';
import {
	getTableData,
	createTableRecord,
	updateTableRecord,
	deleteTableRecord
} from './repositories/explorer.repository';
import { parseValueForDatabase } from './services/explorer.service';
import { generateZodSchema, generateUpdateSchema } from './services/schema-generator.service';

/**
 * Extraire un message d'erreur explicite depuis une erreur Prisma
 */
function extractPrismaErrorMessage(error: unknown, defaultMessage: string): string {
	if (!(error instanceof Error)) return defaultMessage;

	// Erreur de contrainte d'unicité
	if (error.message.includes('Unique constraint')) {
		return 'Un enregistrement avec cette valeur existe déjà';
	}

	// Erreur de clé étrangère
	if (error.message.includes('Foreign key constraint')) {
		return 'Référence invalide vers un autre enregistrement';
	}

	// Erreur de champ requis (NOT NULL constraint)
	// Format Prisma: "Argument `field_name` must not be null."
	if (error.message.includes('must not be null')) {
		const regex = /Argument `(\w+)` must not be null/;
		const match = regex.exec(error.message);
		if (match) {
			return `Le champ "${match[1]}" est requis`;
		}
		return 'Des champs requis sont manquants';
	}

	if (error.message.includes('null') || error.message.includes('required')) {
		return 'Des champs requis sont manquants';
	}

	// Enregistrement non trouvé
	if (error.message.includes('Record to update not found')) {
		return 'Enregistrement non trouvé';
	}

	// Autres erreurs : afficher le message original
	return `Erreur : ${error.message}`;
}

/**
 * Charger toutes les tables des trois bases de données
 */
export const load: PageServerLoad = async () => {
	const allTables = await getAllDatabaseTablesFromPostgres();
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
			// Récupérer les métadonnées de la table (essayer les deux schémas)
			let metadata = await getTableMetadataFromPostgres(database, tableName, 'public');
			metadata ??= await getTableMetadataFromPostgres(database, tableName, 'produit');

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
				// Formater les erreurs de validation de manière lisible
				const errorMessages = validation.error.issues.map((issue) => {
					const fieldName = issue.path.join('.');
					return `${fieldName}: ${issue.message}`;
				});
				return fail(400, {
					success: false,
					error: `Erreur de validation : ${errorMessages.join(', ')}`,
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

			const errorMessage = extractPrismaErrorMessage(
				error,
				"Erreur lors de la création de l'enregistrement"
			);

			return fail(500, {
				success: false,
				error: errorMessage
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
			// Récupérer les métadonnées de la table (essayer les deux schémas)
			let metadata = await getTableMetadataFromPostgres(database, tableName, 'public');
			metadata ??= await getTableMetadataFromPostgres(database, tableName, 'produit');

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
				// Formater les erreurs de validation de manière lisible
				const errorMessages = validation.error.issues.map((issue) => {
					const fieldName = issue.path.join('.');
					return `${fieldName}: ${issue.message}`;
				});
				return fail(400, {
					success: false,
					error: `Erreur de validation : ${errorMessages.join(', ')}`,
					errors: validation.error.issues
				});
			}

			// Modifier l'enregistrement avec le bon schéma
			await updateTableRecord(
				database,
				tableName,
				primaryKeyValue,
				validation.data,
				metadata.schema || 'public'
			);

			return {
				success: true,
				message: 'Enregistrement modifié avec succès'
			};
		} catch (error) {
			console.error('Erreur lors de la modification:', error);

			const errorMessage = extractPrismaErrorMessage(
				error,
				"Erreur lors de la modification de l'enregistrement"
			);

			return fail(500, {
				success: false,
				error: errorMessage
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
			// Récupérer les métadonnées pour le schéma
			let metadata = await getTableMetadataFromPostgres(database, tableName, 'public');
			metadata ??= await getTableMetadataFromPostgres(database, tableName, 'produit');

			// Supprimer l'enregistrement
			await deleteTableRecord(
				database,
				tableName,
				primaryKeyValue,
				metadata?.schema || 'public'
			);

			return {
				success: true,
				message: 'Enregistrement supprimé avec succès'
			};
		} catch (error) {
			console.error('Erreur lors de la suppression:', error);
			return fail(500, {
				success: false,
				error: "Erreur lors de la suppression de l'enregistrement"
			});
		}
	},

	/**
	 * Supprimer plusieurs enregistrements en une seule transaction
	 */
	deleteMultiple: async ({ request }) => {
		const formData = await request.formData();
		const database = formData.get('database') as DatabaseName;
		const tableName = formData.get('tableName') as string;
		const primaryKeyValuesJson = formData.get('primaryKeyValues') as string;

		try {
			const primaryKeyValues = JSON.parse(primaryKeyValuesJson) as unknown[];

			if (!Array.isArray(primaryKeyValues) || primaryKeyValues.length === 0) {
				return fail(400, {
					success: false,
					error: 'Aucun enregistrement sélectionné'
				});
			}

			const client = await getClient(database);
			const metadata = await getTableMetadataFromPostgres(database, tableName);

			if (!metadata) {
				return fail(404, {
					success: false,
					error: `Table ${tableName} introuvable`
				});
			}

			// ✅ Transaction Prisma pour garantir atomicité
			const clientWithTransaction = client as {
				$transaction: <T>(fn: (tx: typeof client) => Promise<T>) => Promise<T>;
			};

			await clientWithTransaction.$transaction(async (tx) => {
				const table = tx[tableName] as {
					deleteMany: (args: { where: Record<string, unknown> }) => Promise<{ count: number }>;
				};

				if (!table?.deleteMany) {
					throw new Error(`Table ${tableName} n'a pas de méthode deleteMany`);
				}

				await table.deleteMany({
					where: {
						[metadata.primaryKey]: {
							in: primaryKeyValues
						}
					}
				});
			});

			return {
				success: true,
				count: primaryKeyValues.length,
				message: `${primaryKeyValues.length} enregistrement(s) supprimé(s) avec succès`
			};
		} catch (error) {
			console.error('Erreur lors de la suppression multiple:', error);
			return fail(500, {
				success: false,
				error: 'Erreur lors de la suppression multiple'
			});
		}
	}
};
