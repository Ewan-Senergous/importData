// src/lib/postgres-metadata.ts
// Métadonnées PostgreSQL via INFORMATION_SCHEMA (sans Prisma DMMF)
//
// ✅ Avantages :
// - Toujours exact (lit directement depuis PostgreSQL)
// - Standard SQL (portable et facile à debugger)
// - Pas de cache (infos en temps réel)
// - IA-friendly (SQL clair)

import { getClient } from './prisma-meta';
import type { DatabaseName } from './prisma-meta';
import { createChildLogger } from './server/logger';

const logger = createChildLogger('postgres-metadata');

/**
 * Interface pour les métadonnées PostgreSQL depuis INFORMATION_SCHEMA
 */
interface PostgresColumnMetadata {
	column_name: string;
	is_nullable: 'YES' | 'NO';
	column_default: string | null;
	data_type: string;
	udt_name: string;
	ordinal_position: number;
	is_primary_key: boolean;
}

/**
 * Interface pour les informations de champ (compatible avec FieldInfo existant)
 */
export interface FieldInfo {
	name: string;
	type: string;
	isRequired: boolean;
	isPrimaryKey: boolean;
	isTimestamp?: boolean;
	dbType?: string;
	hasDefaultValue?: boolean;
	isUpdatedAt?: boolean;
}

/**
 * Interface pour les informations de table
 */
export interface TableInfo {
	name: string;
	displayName: string;
	schema: string;
	category: 'table' | 'view';
	database: DatabaseName;
}

/**
 * Interface pour les métadonnées de table
 */
export interface TableMetadata {
	name: string;
	primaryKey: string;
	schema: string;
	fields: FieldInfo[];
	category?: 'table' | 'view';
}

/**
 * Mapper les types PostgreSQL vers les types Prisma
 */
function mapPostgresTypeToPrisma(dataType: string, udtName: string): string {
	// Types courants PostgreSQL → Prisma
	const typeMap: Record<string, string> = {
		// Texte
		'character varying': 'String',
		varchar: 'String',
		character: 'String',
		char: 'String',
		text: 'String',

		// Nombres entiers
		integer: 'Int',
		int: 'Int',
		int4: 'Int',
		smallint: 'Int',
		int2: 'Int',
		bigint: 'BigInt',
		int8: 'BigInt',

		// Nombres décimaux
		numeric: 'Decimal',
		decimal: 'Decimal',
		real: 'Float',
		float4: 'Float',
		'double precision': 'Float',
		float8: 'Float',

		// Booléens
		boolean: 'Boolean',
		bool: 'Boolean',

		// Dates et temps
		'timestamp without time zone': 'DateTime',
		'timestamp with time zone': 'DateTime',
		timestamp: 'DateTime',
		timestamptz: 'DateTime',
		date: 'DateTime',
		time: 'DateTime',

		// JSON
		json: 'Json',
		jsonb: 'Json',

		// UUID
		uuid: 'String'
	};

	// Chercher d'abord par data_type
	const mappedType = typeMap[dataType.toLowerCase()];
	if (mappedType) return mappedType;

	// Sinon chercher par udt_name
	const udtMappedType = typeMap[udtName.toLowerCase()];
	if (udtMappedType) return udtMappedType;

	// Défaut : String
	console.warn(
		`Type PostgreSQL inconnu: ${dataType} (${udtName}), utilisation de String par défaut`
	);
	return 'String';
}

/**
 * Détecter si un champ est un @updatedAt via convention de nommage
 */
function isUpdatedAtField(columnName: string, columnDefault: string | null): boolean {
	// Convention : updated_at avec default now()
	const isUpdatedAtName = /^updated_at$/i.test(columnName);
	const hasNowDefault =
		columnDefault?.toLowerCase().includes('now()') ||
		columnDefault?.toLowerCase().includes('current_timestamp');

	return isUpdatedAtName && hasNowDefault === true;
}

/**
 * Récupérer les métadonnées d'une table depuis INFORMATION_SCHEMA
 */
export async function getTableMetadataFromPostgres(
	database: DatabaseName,
	tableName: string,
	schema = 'public'
): Promise<TableMetadata | null> {
	const client = await getClient(database);

	try {
		logger.debug({ database, tableName, schema }, 'Fetching table metadata from PostgreSQL');

		// Requête INFORMATION_SCHEMA avec détection clé primaire
		// ✅ DISTINCT pour éviter les doublons si un champ est dans plusieurs contraintes
		const columns = await (
			client as {
				$queryRaw: <T>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
			}
		).$queryRaw<PostgresColumnMetadata[]>`
			SELECT DISTINCT ON (c.column_name)
				c.column_name,
				c.is_nullable,
				c.column_default,
				c.data_type,
				c.udt_name,
				c.ordinal_position,
				CASE WHEN tc.constraint_type = 'PRIMARY KEY' THEN true ELSE false END AS is_primary_key
			FROM information_schema.columns c
			LEFT JOIN information_schema.key_column_usage kcu
				ON c.table_schema = kcu.table_schema
				AND c.table_name = kcu.table_name
				AND c.column_name = kcu.column_name
			LEFT JOIN information_schema.table_constraints tc
				ON kcu.constraint_name = tc.constraint_name
				AND tc.constraint_type = 'PRIMARY KEY'
			WHERE c.table_name = ${tableName}
				AND c.table_schema = ${schema}
			ORDER BY c.column_name, c.ordinal_position
		`;

		// ✅ Trier par ordre de définition dans la BDD (ordinal_position)
		columns.sort((a, b) => a.ordinal_position - b.ordinal_position);

		if (columns.length === 0) {
			logger.warn({ database, tableName, schema }, 'No columns found for table');
			return null;
		}

		logger.debug(
			{
				database,
				tableName,
				schema,
				columnCount: columns.length
			},
			'Table columns fetched'
		);

		// Mapper vers FieldInfo
		const fields: FieldInfo[] = columns.map((col) => ({
			name: col.column_name,
			type: mapPostgresTypeToPrisma(col.data_type, col.udt_name),
			isRequired: col.is_nullable === 'NO',
			isPrimaryKey: col.is_primary_key,
			hasDefaultValue: col.column_default !== null,
			isUpdatedAt: isUpdatedAtField(col.column_name, col.column_default),
			isTimestamp:
				col.data_type.includes('timestamp') &&
				/^(created_at|updated_at|deleted_at|timestamp|date_|.*_at)$/i.test(col.column_name),
			dbType: col.data_type
		}));

		// Détecter la clé primaire
		const primaryKeyField = fields.find((f) => f.isPrimaryKey);
		const primaryKey = primaryKeyField?.name || fields[0]?.name || 'id';

		// Détecter si c'est une vue ou une table
		const tableType = await (
			client as {
				$queryRaw: <T>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
			}
		).$queryRaw<{ table_type: string }[]>`
			SELECT table_type
			FROM information_schema.tables
			WHERE table_name = ${tableName} AND table_schema = ${schema}
		`;

		const category = tableType[0]?.table_type === 'VIEW' ? 'view' : 'table';

		logger.info(
			{
				database,
				tableName,
				schema,
				primaryKey,
				category,
				fieldCount: fields.length
			},
			'Table metadata loaded successfully'
		);

		return {
			name: tableName,
			primaryKey,
			schema,
			fields,
			category
		};
	} catch (error) {
		logger.error(
			{
				database,
				tableName,
				schema,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined
			},
			'Failed to fetch table metadata'
		);
		return null;
	}
}

/**
 * Récupérer toutes les tables d'une base via INFORMATION_SCHEMA
 */
export async function getAllTablesFromPostgres(database: DatabaseName): Promise<TableInfo[]> {
	const client = await getClient(database);

	try {
		const tables = await (
			client as {
				$queryRaw: <T>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
			}
		).$queryRaw<
			{
				table_name: string;
				table_schema: string;
				table_type: string;
			}[]
		>`
			SELECT
				table_name,
				table_schema,
				table_type
			FROM information_schema.tables
			WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
			ORDER BY table_schema, table_name
		`;

		return tables.map((t) => ({
			name: t.table_name,
			displayName: t.table_name,
			schema: t.table_schema,
			category: t.table_type === 'VIEW' ? 'view' : 'table',
			database
		}));
	} catch (error) {
		console.error(`Erreur lors de la récupération des tables pour ${database}:`, error);
		return [];
	}
}

/**
 * Récupérer toutes les tables de toutes les bases de données
 */
export async function getAllDatabaseTablesFromPostgres(): Promise<TableInfo[]> {
	const databases: DatabaseName[] = ['cenov', 'cenov_dev', 'cenov_preprod'];
	const allTables: TableInfo[] = [];

	for (const database of databases) {
		try {
			const tables = await getAllTablesFromPostgres(database);
			allTables.push(...tables);
		} catch (error) {
			console.error(`Erreur lors de la récupération des tables pour ${database}:`, error);
		}
	}

	return allTables;
}
