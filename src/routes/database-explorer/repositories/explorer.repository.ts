import { getClient, getTableMetadata, countTableRows, getDatabases } from '$lib/prisma-meta';
import type { DatabaseName, FieldInfo } from '$lib/prisma-meta';

/**
 * Interface pour les métadonnées d'une table
 */
export interface TableMetadata {
	name: string;
	primaryKey: string;
	schema: string;
	fields: FieldInfo[];
	category?: 'table' | 'view';
}

/**
 * Options pour la récupération des données
 */
export interface GetTableDataOptions {
	page?: number;
	limit?: number;
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

/**
 * Récupérer données paginées d'une table
 * Utilise requête SQL brute pour récupérer les timestamps au format PostgreSQL brut
 */
export async function getTableData(
	database: DatabaseName,
	tableName: string,
	options: GetTableDataOptions = {}
): Promise<TableDataResult> {
	const { page = 1, limit = 500 } = options;

	const client = await getClient(database);
	const metadata = await getTableMetadata(database, tableName);

	if (!metadata) {
		throw new Error(`Table ${tableName} introuvable dans la base ${database}`);
	}

	const skip = (page - 1) * limit;
	const schema = metadata.schema || 'public';

	// Identifier les colonnes DateTime pour conversion en string (comme export ligne 206-207)
	const timestampColumns = metadata.fields.filter((f) => f.type === 'DateTime' || f.isTimestamp);

	// Récupérer le vrai nom de table (@@map si défini)
	let realTableName = tableName;
	const databases = await getDatabases();
	const model = databases[database].dmmf.datamodel.models.find((m) => m.name === tableName);
	if (model) {
		const modelWithMeta = model as { dbName?: string };
		if (modelWithMeta.dbName) {
			realTableName = modelWithMeta.dbName;
		}
	}

	// Construire sélections avec ::text pour timestamps (comme export lignes 224-233)
	const selectColumns = '*';
	let timestampSelects = '';

	if (timestampColumns.length > 0) {
		timestampSelects =
			', ' +
			timestampColumns
				.map(
					(col) =>
						`"${col.name.replaceAll('"', '""')}"::text as "${col.name.replaceAll('"', '""')}_str"`
				)
				.join(', ');
	}

	// Requête SQL brute avec pagination
	const qualifiedTableName = `"${schema.replaceAll('"', '""')}"."${realTableName.replaceAll('"', '""')}"`;
	const query = `SELECT ${selectColumns}${timestampSelects} FROM ${qualifiedTableName} LIMIT ${limit} OFFSET ${skip}`;

	try {
		const rawData = (await (client as { $queryRawUnsafe: (query: string) => Promise<unknown[]> }).$queryRawUnsafe(
			query
		)) as Record<string, unknown>[];

		// Post-traitement : remplacer colonnes Date par versions string (comme export lignes 267-277)
		const data = rawData.map((row) => {
			const processedRow = { ...row };
			for (const col of timestampColumns) {
				const stringKey = `${col.name}_str`;
				if (processedRow[stringKey]) {
					// Remplacer la version Date par la version string avec microsecondes
					processedRow[col.name] = processedRow[stringKey];
					// Supprimer la colonne temporaire _str
					delete processedRow[stringKey];
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
	data: Record<string, unknown>
): Promise<Record<string, unknown>> {
	const client = await getClient(database);
	const metadata = await getTableMetadata(database, tableName);

	if (!metadata) {
		throw new Error(`Table ${tableName} introuvable dans la base ${database}`);
	}

	const where = { [metadata.primaryKey]: primaryKeyValue };
	const table = client[tableName] as {
		update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
	};

	return table.update({ where, data });
}

/**
 * Supprimer un enregistrement
 */
export async function deleteTableRecord(
	database: DatabaseName,
	tableName: string,
	primaryKeyValue: unknown
): Promise<void> {
	const client = await getClient(database);
	const metadata = await getTableMetadata(database, tableName);

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
	primaryKeyValue: unknown
): Promise<Record<string, unknown> | null> {
	const client = await getClient(database);
	const metadata = await getTableMetadata(database, tableName);

	if (!metadata) {
		throw new Error(`Table ${tableName} introuvable dans la base ${database}`);
	}

	const where = { [metadata.primaryKey]: primaryKeyValue };
	const table = client[tableName] as {
		findUnique: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
	};

	return table.findUnique({ where });
}