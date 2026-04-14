import { getClient, type DatabaseName } from '$lib/prisma-meta';
import { sqltag as sql, raw, join, type Sql } from '@prisma/client/runtime/client';
import { createChildLogger } from '$lib/server/logger';

const log = createChildLogger('import-csv-bdd');

// ============================================================================
// TYPES (formes des résultats SQL — valeurs issues de information_schema)
// ============================================================================

export interface ColumnInfo {
	name: string;
	dataType: string;
	isNullable: boolean;
	isAutoIncrement: boolean;
	maxLength: number | null;
	hasDefault: boolean;
}

export interface TableSchemaInfo {
	tableName: string;
	schemaName: string;
	columns: ColumnInfo[];
	upsertKey: string | null;
}

type RawColumn = {
	column_name: string;
	data_type: string;
	is_nullable: string;
	column_default: string | null;
	character_maximum_length: string | number | null;
	is_auto_increment: boolean;
	has_default: boolean;
};

type RawTable = {
	table_name: string;
	table_schema: string;
};

type RawConstraint = {
	constraint_name: string;
	constraint_type: string;
	column_name: string;
	is_not_nullable: boolean;
	column_default: string | null;
};

type RawClient = {
	$queryRaw: <T = unknown>(query: TemplateStringsArray | Sql, ...values: unknown[]) => Promise<T>;
	$executeRaw: (query: TemplateStringsArray | Sql, ...values: unknown[]) => Promise<number>;
};

// ============================================================================
// SÉCURITÉ
// ============================================================================

const ALLOWED_SCHEMAS = new Set(['public', 'produit', 'sas']);

function validateIdentifier(value: string, context: string): void {
	if (!/^[a-z_][a-z0-9_]*$/i.test(value)) {
		throw new Error(`${context} invalide: "${value}"`);
	}
}

// ============================================================================
// LECTURE information_schema
// ============================================================================

export async function getAvailableTables(database: DatabaseName): Promise<RawTable[]> {
	const client = (await getClient(database)) as unknown as RawClient;

	return client.$queryRaw<RawTable[]>`
		SELECT table_name, table_schema
		FROM information_schema.tables
		WHERE table_type = 'BASE TABLE'
		  AND table_schema = ANY(ARRAY['public', 'produit', 'sas'])
		ORDER BY table_schema, table_name
	`;
}

export async function getTableInfo(
	database: DatabaseName,
	tableName: string
): Promise<TableSchemaInfo | null> {
	validateIdentifier(tableName, 'Nom de table');

	const client = (await getClient(database)) as unknown as RawClient;

	const tables = await client.$queryRaw<RawTable[]>`
		SELECT table_schema, table_name
		FROM information_schema.tables
		WHERE table_name = ${tableName}
		  AND table_schema = ANY(ARRAY['public', 'produit', 'sas'])
		  AND table_type = 'BASE TABLE'
		LIMIT 1
	`;

	if (tables.length === 0) return null;

	const schemaName = tables[0].table_schema;

	const rawColumns = await client.$queryRaw<RawColumn[]>`
		SELECT
			column_name,
			data_type,
			is_nullable,
			column_default,
			character_maximum_length,
			(column_default LIKE 'nextval%') AS is_auto_increment,
			(column_default IS NOT NULL) AS has_default
		FROM information_schema.columns
		WHERE table_schema = ${schemaName}
		  AND table_name = ${tableName}
		ORDER BY ordinal_position
	`;

	const columns: ColumnInfo[] = rawColumns.map((r) => ({
		name: r.column_name,
		dataType: r.data_type,
		isNullable: r.is_nullable === 'YES',
		isAutoIncrement: typeof r.column_default === 'string' && r.column_default.startsWith('nextval'),
		maxLength: r.character_maximum_length === null ? null : Number(r.character_maximum_length),
		hasDefault: r.column_default !== null
	}));

	const constraints = await client.$queryRaw<RawConstraint[]>`
		SELECT
			con.conname                                 AS constraint_name,
			con.contype::text                           AS constraint_type,
			att.attname                                 AS column_name,
			att.attnotnull                              AS is_not_nullable,
			pg_get_expr(def.adbin, def.adrelid)         AS column_default
		FROM pg_constraint con
		JOIN pg_namespace nsp ON nsp.oid = con.connamespace
		JOIN pg_class     cls ON cls.oid = con.conrelid
		JOIN pg_attribute att ON att.attrelid = con.conrelid
		                     AND att.attnum = ANY(con.conkey)
		LEFT JOIN pg_attrdef def ON def.adrelid = con.conrelid
		                        AND def.adnum = att.attnum
		WHERE nsp.nspname = ${schemaName}
		  AND cls.relname = ${tableName}
		  AND con.contype IN ('u', 'p')
		  AND array_length(con.conkey, 1) = 1
		ORDER BY con.contype DESC, att.attnum
	`;

	let upsertKey: string | null = null;

	if (constraints.length > 0) {
		const isSerial = (row: RawConstraint) =>
			typeof row.column_default === 'string' && row.column_default.startsWith('nextval');

		const unique = constraints.find(
			(r) => r.constraint_type === 'u' && !isSerial(r) && r.is_not_nullable
		);
		if (unique) {
			upsertKey = unique.column_name;
		} else {
			const pk = constraints.find((r) => r.constraint_type === 'p' && !isSerial(r));
			upsertKey = pk?.column_name ?? null;
		}
	}

	return { tableName, schemaName, columns, upsertKey };
}

// ============================================================================
// INSERT / UPSERT via $executeRaw (jamais $queryRawUnsafe)
// ============================================================================

function validateInsertParams(tableInfo: TableSchemaInfo, activeColumns: string[]): void {
	validateIdentifier(tableInfo.tableName, 'Nom de table');
	validateIdentifier(tableInfo.schemaName, 'Nom de schéma');

	if (!ALLOWED_SCHEMAS.has(tableInfo.schemaName)) {
		throw new Error(`Schéma non autorisé: "${tableInfo.schemaName}"`);
	}
	for (const col of activeColumns) {
		validateIdentifier(col, 'Nom de colonne');
	}
}

function buildConflictFragment(upsertKey: string | null, activeColumns: string[]): Sql | null {
	if (!upsertKey || !activeColumns.includes(upsertKey)) return null;

	const updateCols = activeColumns.filter((c) => c !== upsertKey);
	if (updateCols.length === 0) return null;

	const setClauses = raw(updateCols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(', '));
	const conflictCol = raw(`"${upsertKey}"`);
	return sql`ON CONFLICT (${conflictCol}) DO UPDATE SET ${setClauses}`;
}

export async function insertRows(
	database: DatabaseName,
	tableInfo: TableSchemaInfo,
	activeColumns: string[],
	rows: unknown[][]
): Promise<{ inserted: number; updated: number; errors: { line: number; error: string }[] }> {
	validateInsertParams(tableInfo, activeColumns);

	const client = (await getClient(database)) as unknown as RawClient;
	const result = { inserted: 0, updated: 0, errors: [] as { line: number; error: string }[] };

	const tableRef = raw(`"${tableInfo.schemaName}"."${tableInfo.tableName}"`);
	const colList = raw(activeColumns.map((c) => `"${c}"`).join(', '));
	const conflictFragment = buildConflictFragment(tableInfo.upsertKey, activeColumns);

	for (let i = 0; i < rows.length; i++) {
		try {
			const values = rows[i];
			const query = conflictFragment
				? sql`INSERT INTO ${tableRef} (${colList}) VALUES (${join(values)}) ${conflictFragment}`
				: sql`INSERT INTO ${tableRef} (${colList}) VALUES (${join(values)}) ON CONFLICT DO NOTHING`;

			const affected = await client.$executeRaw(query);
			if (affected > 0) {
				result.inserted += affected;
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			result.errors.push({ line: i + 3, error: msg });
			log.warn({ line: i + 3, err: msg }, 'Erreur insertion ligne');
		}
	}

	log.info(
		{
			table: tableInfo.tableName,
			database,
			inserted: result.inserted,
			errors: result.errors.length
		},
		'Import termine'
	);

	return result;
}
