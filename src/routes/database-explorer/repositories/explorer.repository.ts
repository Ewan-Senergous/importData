import { getClient, countTableRows } from '$lib/prisma-meta';
import type { DatabaseName } from '$lib/prisma-meta';
import { getTableMetadataFromPostgres, type TableMetadata } from '$lib/postgres-metadata';

// Ré-exporter TableMetadata pour compatibilité avec le reste du code
export type { TableMetadata } from '$lib/postgres-metadata';

/**
 * Options pour la récupération des données
 */
export interface GetTableDataOptions {
	page?: number;
	limit?: number;
	schema?: string; // Schéma de la table (public, produit, etc.)
	orderBy?: { field: string; order: 'asc' | 'desc' };
	filters?: Record<string, unknown>;
}

/**
 * Résultat de la récupération des données
 */
export interface TableDataResult {
	data: Record<string, unknown>[];
	total: number;
	metadata: TableMetadata;
}

export async function getTableData(
	database: DatabaseName,
	tableName: string,
	options: GetTableDataOptions = {}
): Promise<TableDataResult> {
	const { page = 1, limit = 500, schema = 'public' } = options;

	// ✅ Validation stricte anti-injection
	if (!Number.isInteger(page) || page < 1 || page > 10000) {
		throw new Error(`Page invalide: ${page}`);
	}
	if (!Number.isInteger(limit) || limit < 1 || limit > 10000) {
		throw new Error(`Limit invalide: ${limit}`);
	}
	if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) {
		throw new Error(`Schema invalide: ${schema}`);
	}
	if (!/^[a-z_][a-z0-9_]*$/i.test(tableName)) {
		throw new Error(`Table invalide: ${tableName}`);
	}

	const client = await getClient(database);
	const metadata = await getTableMetadataFromPostgres(database, tableName, schema);

	if (!metadata) {
		throw new Error(`Table ${tableName} introuvable dans la base ${database}`);
	}

	const skip = (page - 1) * limit;
	const timestampColumns = metadata.fields.filter((f) => f.type === 'DateTime' || f.isTimestamp);

	try {
		// ✅ SÉCURISÉ - Utiliser méthode Prisma native
		const table = client[tableName] as {
			findMany?: (args: {
				skip: number;
				take: number;
				orderBy?: Record<string, string>;
			}) => Promise<Record<string, unknown>[]>;
		};

		if (!table?.findMany) {
			throw new Error(`Table ${tableName} n'a pas de méthode findMany`);
		}

		// ✅ Prisma exige orderBy pour les vues quand take est utilisé
		const rawData = await table.findMany({
			skip,
			take: limit,
			orderBy: { [metadata.primaryKey]: 'asc' }
		});

		// Post-traitement timestamps : convertir Date au format PostgreSQL
		const data = rawData.map((row) => {
			const processedRow = { ...row };
			for (const col of timestampColumns) {
				const value = processedRow[col.name];
				if (value instanceof Date) {
					// Format PostgreSQL : YYYY-MM-DD HH:MM:SS.mmm
					processedRow[col.name] = value
						.toISOString()
						.replace('T', ' ')
						.replace('Z', '')
						.slice(0, 23); // Garder millisecondes (3 chiffres)
				}
			}
			return processedRow;
		});

		const total = await countTableRows(database, tableName);

		return { data, total, metadata };
	} catch (error) {
		throw new Error(
			`Erreur lors de la récupération des données de ${tableName}: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
		);
	}
}

/**
 * Créer un nouvel enregistrement
 */
export async function createTableRecord(
	database: DatabaseName,
	tableName: string,
	data: Record<string, unknown>
): Promise<Record<string, unknown>> {
	const client = await getClient(database);
	const table = client[tableName] as {
		create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
	};
	return table.create({ data });
}

/**
 * Modifier un enregistrement existant
 */
export async function updateTableRecord(
	database: DatabaseName,
	tableName: string,
	primaryKeyValue: unknown,
	data: Record<string, unknown>,
	schema = 'public'
): Promise<Record<string, unknown>> {
	const client = await getClient(database);
	const metadata = await getTableMetadataFromPostgres(database, tableName, schema);

	if (!metadata) {
		throw new Error(`Table ${tableName} introuvable dans la base ${database}`);
	}

	const where = { [metadata.primaryKey]: primaryKeyValue };
	const table = client[tableName] as {
		update: (args: {
			where: Record<string, unknown>;
			data: Record<string, unknown>;
		}) => Promise<Record<string, unknown>>;
	};

	return table.update({ where, data });
}

/**
 * Supprimer un enregistrement
 */
export async function deleteTableRecord(
	database: DatabaseName,
	tableName: string,
	primaryKeyValue: unknown,
	schema = 'public'
): Promise<void> {
	const client = await getClient(database);
	const metadata = await getTableMetadataFromPostgres(database, tableName, schema);

	if (!metadata) {
		throw new Error(`Table ${tableName} introuvable dans la base ${database}`);
	}

	const where = { [metadata.primaryKey]: primaryKeyValue };
	const table = client[tableName] as {
		delete: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown>>;
	};

	await table.delete({ where });
}

/**
 * Récupérer un seul enregistrement par sa clé primaire
 */
export async function getTableRecord(
	database: DatabaseName,
	tableName: string,
	primaryKeyValue: unknown,
	schema = 'public'
): Promise<Record<string, unknown> | null> {
	const client = await getClient(database);
	const metadata = await getTableMetadataFromPostgres(database, tableName, schema);

	if (!metadata) {
		throw new Error(`Table ${tableName} introuvable dans la base ${database}`);
	}

	const where = { [metadata.primaryKey]: primaryKeyValue };
	const table = client[tableName] as {
		findUnique: (args: {
			where: Record<string, unknown>;
		}) => Promise<Record<string, unknown> | null>;
	};

	return table.findUnique({ where });
}
