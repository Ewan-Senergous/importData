import { getClient, getTableMetadata, countTableRows } from '$lib/prisma-meta';
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
 */
export async function getTableData(
	database: DatabaseName,
	tableName: string,
	options: GetTableDataOptions = {}
): Promise<TableDataResult> {
	const { page = 1, limit = 500, orderBy, filters } = options;

	const client = await getClient(database);
	const metadata = await getTableMetadata(database, tableName);

	if (!metadata) {
		throw new Error(`Table ${tableName} introuvable dans la base ${database}`);
	}

	const skip = (page - 1) * limit;
	const where = filters || {};
	const order = orderBy ? { [orderBy.field]: orderBy.order } : undefined;

	// Cast explicite pour éviter l'erreur TypeScript "unknown"
	const table = client[tableName] as {
		findMany: (args: { skip: number; take: number; where: Record<string, unknown>; orderBy?: Record<string, string> }) => Promise<Record<string, unknown>[]>;
	};

	const [data, total] = await Promise.all([
		table.findMany({ skip, take: limit, where, orderBy: order }),
		countTableRows(database, tableName)
	]);

	return { data, total, metadata };
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