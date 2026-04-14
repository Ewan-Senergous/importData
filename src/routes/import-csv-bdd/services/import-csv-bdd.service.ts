import type { ColumnInfo, TableSchemaInfo } from '../repositories/import-csv-bdd.repository';

// ============================================================================
// TYPES
// ============================================================================

export interface ParsedCSV {
	tableName: string;
	headers: string[];
	rows: Record<string, string>[];
}

export interface ValidationResult {
	success: boolean;
	tableName: string;
	schemaName: string;
	upsertKey: string | null;
	activeColumns: string[];
	ignoredColumns: string[];
	validRows: number;
	totalRows: number;
	errors: { line: number; col: string; message: string }[];
	warnings: { col: string; message: string }[];
}

// ============================================================================
// PARSE CSV
// ============================================================================

export function parseCSV(csvContent: string): ParsedCSV | null {
	const content = csvContent.replace(/^\uFEFF/, '');
	const lines = content.split(/\r?\n/);

	if (lines.length < 2) return null;

	const firstLine = lines[0].trim();
	const tableMatch = /^#\s*Table:\s*(\w+)/i.exec(firstLine);
	if (!tableMatch) return null;

	const tableName = tableMatch[1];

	const headers = lines[1]
		.split(';')
		.map((h) => h.trim())
		.filter(Boolean);
	if (headers.length === 0) return null;

	const rows: Record<string, string>[] = [];
	for (let i = 2; i < lines.length; i++) {
		const line = lines[i];
		if (!line || line.trim() === '') continue;

		const values = line.split(';');
		if (values.every((v) => !v || v.trim() === '')) continue;

		const row: Record<string, string> = {};
		for (const [index, header] of headers.entries()) {
			row[header] = values[index] ? values[index].trim() : '';
		}
		rows.push(row);
	}

	return { tableName, headers, rows };
}

// ============================================================================
// VALIDATION (toutes les règles dérivées de information_schema)
// ============================================================================

const NUMERIC_TYPES = new Set([
	'integer',
	'bigint',
	'smallint',
	'numeric',
	'decimal',
	'real',
	'double precision'
]);

const DATE_TYPES = new Set(['date', 'timestamp without time zone', 'timestamp with time zone']);

function classifyColumns(
	headers: string[],
	dbColMap: Map<string, ColumnInfo>
): {
	activeColumns: string[];
	ignoredColumns: string[];
	warnings: ValidationResult['warnings'];
} {
	const activeColumns: string[] = [];
	const ignoredColumns: string[] = [];
	const warnings: ValidationResult['warnings'] = [];

	for (const header of headers) {
		const dbCol = dbColMap.get(header);
		if (!dbCol) {
			ignoredColumns.push(header);
			warnings.push({ col: header, message: `Colonne "${header}" absente en BDD → ignorée` });
		} else if (dbCol.isAutoIncrement) {
			ignoredColumns.push(header);
		} else {
			activeColumns.push(header);
		}
	}

	return { activeColumns, ignoredColumns, warnings };
}

function validateCell(
	trimmed: string,
	dbCol: ColumnInfo,
	lineNumber: number,
	colName: string
): ValidationResult['errors'][number] | null {
	if (trimmed === '' && dbCol.hasDefault) return null;

	if (trimmed === '' && !dbCol.isNullable && !dbCol.hasDefault) {
		return {
			line: lineNumber,
			col: colName,
			message: 'Valeur obligatoire (NOT NULL, pas de default)'
		};
	}

	if (trimmed === '') return null;

	if (dbCol.maxLength !== null && trimmed.length > dbCol.maxLength) {
		return {
			line: lineNumber,
			col: colName,
			message: `Trop long (${trimmed.length}/${dbCol.maxLength} caractères)`
		};
	}

	if (NUMERIC_TYPES.has(dbCol.dataType) && Number.isNaN(Number(trimmed.replace(',', '.')))) {
		return { line: lineNumber, col: colName, message: 'Valeur numérique invalide' };
	}

	if (DATE_TYPES.has(dbCol.dataType) && Number.isNaN(new Date(trimmed).getTime())) {
		return { line: lineNumber, col: colName, message: 'Format de date invalide' };
	}

	return null;
}

export function validateImport(parsed: ParsedCSV, tableInfo: TableSchemaInfo): ValidationResult {
	const errors: ValidationResult['errors'] = [];
	const dbColMap = new Map<string, ColumnInfo>(tableInfo.columns.map((c) => [c.name, c]));

	const { activeColumns, ignoredColumns, warnings } = classifyColumns(parsed.headers, dbColMap);

	if (!tableInfo.upsertKey) {
		warnings.push({
			col: 'upsert_key',
			message: 'Pas de clé UNIQUE simple détectée → insertions avec ON CONFLICT DO NOTHING'
		});
	}

	let validRows = 0;
	for (let i = 0; i < parsed.rows.length; i++) {
		const row = parsed.rows[i];
		const lineNumber = i + 3;
		let rowValid = true;

		for (const colName of activeColumns) {
			const dbCol = dbColMap.get(colName);
			if (!dbCol) continue;

			const error = validateCell((row[colName] ?? '').trim(), dbCol, lineNumber, colName);
			if (error) {
				errors.push(error);
				rowValid = false;
			}
		}

		if (rowValid) validRows++;
	}

	return {
		success: errors.length === 0,
		tableName: tableInfo.tableName,
		schemaName: tableInfo.schemaName,
		upsertKey: tableInfo.upsertKey,
		activeColumns,
		ignoredColumns,
		validRows,
		totalRows: parsed.rows.length,
		errors,
		warnings
	};
}

// ============================================================================
// COERCITION (string CSV → types JS selon data_type de information_schema)
// ============================================================================

export function coerceRows(
	rows: Record<string, string>[],
	activeColumns: string[],
	dbColumns: ColumnInfo[]
): unknown[][] {
	const dbColMap = new Map<string, ColumnInfo>(dbColumns.map((c) => [c.name, c]));

	return rows.map((row) => {
		const values: unknown[] = [];

		for (const colName of activeColumns) {
			const col = dbColMap.get(colName);
			const rawValue = (row[colName] ?? '').trim();

			if (!col || (rawValue === '' && col.hasDefault)) {
				// Colonne date/timestamp avec default (ex: NOW()) et valeur vide
				// → injecter la date courante pour tracer quand la ligne a ete importee
				if (col && DATE_TYPES.has(col.dataType)) {
					values.push(new Date());
				} else {
					values.push(null);
				}
				continue;
			}

			if (rawValue === '') {
				values.push(col.isNullable ? null : rawValue);
				continue;
			}

			values.push(coerceValue(rawValue, col.dataType));
		}

		return values;
	});
}

function coerceValue(value: string, dataType: string): unknown {
	if (['integer', 'bigint', 'smallint'].includes(dataType)) {
		return Number.parseInt(value, 10);
	}
	if (['numeric', 'decimal', 'real', 'double precision'].includes(dataType)) {
		return Number.parseFloat(value.replace(',', '.'));
	}
	if (dataType === 'boolean') {
		return value === 'true' || value === '1' || value === 't' || value === 'yes';
	}
	if (DATE_TYPES.has(dataType)) {
		return new Date(value);
	}
	return value;
}
