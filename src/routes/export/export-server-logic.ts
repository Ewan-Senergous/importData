// src/routes/export/export-server-logic.ts
import ExcelJS from 'exceljs';
import { XMLBuilder } from 'fast-xml-parser';
import { Prisma } from '../../generated/prisma-cenov/client';
import {
	getTableMetadata,
	getClient,
	getDatabases,
	getAllDatabaseTables,
	getAllDatabaseNames,
	type DatabaseName
} from '$lib/prisma-meta';

// Récupérer Decimal depuis Prisma namespace (Prisma 7)
const Decimal = Prisma.Decimal;
import type { SharedExportData, ExtractionOptions, ExportConfig } from './+page.server';

// Convertir récursivement tous les Decimal en nombres pour sérialisation JSON
function serializeData(obj: unknown): unknown {
	if (obj === null || obj === undefined) return obj;

	// Date doit être vérifié en premier (avant object générique)
	if (obj instanceof Date) return obj;

	// Array doit être vérifié avant object générique
	if (Array.isArray(obj)) return obj.map(serializeData);

	// Détecter Decimal de manière robuste (plusieurs méthodes)
	if (typeof obj === 'object') {
		// Méthode 1 : instanceof
		if (obj instanceof Decimal) {
			const converted = obj.toNumber();
			console.log('🔵 [DEBUG] Decimal converti (instanceof):', obj, '→', converted);
			return converted;
		}

		// Méthode 2 : Détecter les propriétés caractéristiques d'un Decimal
		// Le constructeur peut être minifié (ex: 'i' au lieu de 'Decimal')
		const objWithDecimalProps = obj as {
			toNumber?: () => number;
			s?: number;
			e?: number;
			d?: number[];
		};

		// Un Decimal a toujours : toNumber() + propriétés s, e, d
		if (
			typeof objWithDecimalProps.toNumber === 'function' &&
			typeof objWithDecimalProps.s === 'number' &&
			typeof objWithDecimalProps.e === 'number' &&
			Array.isArray(objWithDecimalProps.d)
		) {
			const converted = objWithDecimalProps.toNumber();
			console.log('🟢 [DEBUG] Decimal converti (structure):', obj, '→', converted);
			return converted;
		}

		// Objet générique : convertir récursivement toutes les propriétés
		const result: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(obj)) {
			result[key] = serializeData(value);
		}
		return result;
	}

	return obj;
}

// Interface pour les fichiers d'export
export interface ExportFile {
	buffer: Buffer;
	fileName: string;
	mimeType: string;
	size: number;
}

// Formatage centralisé des valeurs pour export (CSV, JSON, XML)
export function formatValueForExport(value: unknown): string {
	// Formatage des valeurs nulles
	if (value === null || value === undefined) {
		return '';
	}

	// Formatage des dates
	if (value instanceof Date) {
		return value.toISOString();
	}

	// Formatage des objets
	if (typeof value === 'object') {
		return JSON.stringify(value);
	}

	// Conversion en string pour les primitives (string, number, boolean, bigint)
	// Optimisation : si déjà une string, retourner directement
	if (typeof value === 'string') {
		return value;
	}

	if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
		return String(value);
	}

	console.warn('Unexpected type in formatValueForExport:', typeof value, value);
	return JSON.stringify(value);
}

// Formatage spécialisé pour Excel - garde les types natifs (number, Date, boolean)
function formatValueForExcel(value: unknown): unknown {
	// Valeurs nulles → null (Excel affiche une cellule vide)
	if (value === null || value === undefined) {
		return null;
	}

	// Types natifs Excel : garder tels quels
	if (typeof value === 'number' || typeof value === 'boolean' || value instanceof Date) {
		return value;
	}

	// Strings : garder telles quelles
	if (typeof value === 'string') {
		return value;
	}

	// BigInt : convertir en number pour Excel
	if (typeof value === 'bigint') {
		return Number(value);
	}

	// Objets : sérialiser en JSON
	if (typeof value === 'object') {
		return JSON.stringify(value);
	}

	return value;
}

// Extractions données tables
export async function extractTableData(
	tableId: string,
	options: ExtractionOptions = {}
): Promise<SharedExportData> {
	const { limit, maxBinaryLength } = options;

	let data: Record<string, unknown>[] = [];
	let columns: string[] = [];

	// Parser l'ID pour extraire database et table name
	// Format: "database-tablename" ou juste "tablename" pour compatibilité
	let database: DatabaseName;
	let tableName: string;

	if (tableId.includes('-')) {
		const parts = tableId.split('-');
		const dbName = parts[0];
		// Validation dynamique du nom de base de données
		const validDatabases = await getAllDatabaseNames();
		if (!validDatabases.includes(dbName as DatabaseName)) {
			throw new Error(`Base de données inconnue: ${dbName}. Valides: ${validDatabases.join(', ')}`);
		}
		database = dbName as DatabaseName;
		tableName = parts.slice(1).join('-');
	} else {
		// Fallback: chercher dans toutes les bases
		const allTables = await getAllDatabaseTables();
		const tableInfo = allTables.find((t) => t.name === tableId);
		if (!tableInfo) {
			throw new Error(`Table non trouvée: ${tableId}`);
		}
		database = tableInfo.database;
		tableName = tableInfo.name;
	}

	const metadata = await getTableMetadata(database, tableName);
	if (!metadata) {
		throw new Error(`Métadonnées non trouvées pour ${tableName}`);
	}

	columns = metadata.fields.map((field) => field.name);

	// Pour l'extraction, utiliser des requêtes SQL directes plutôt que les modèles Prisma
	// car les noms de modèles peuvent avoir des préfixes de schéma
	const schema = metadata.schema || 'public';

	// Utiliser le nom @@map si disponible, sinon le nom de table Prisma
	let realTableName = tableName;

	// Récupérer les métadonnées complètes pour accéder au nom @@map
	const databases = await getDatabases();
	const model = databases[database].dmmf.datamodel.models.find((m) => m.name === tableName);

	if (model) {
		const modelWithMeta = model as { dbName?: string };
		// Si un nom @@map existe, l'utiliser (c'est le vrai nom de table en BDD)
		if (modelWithMeta.dbName) {
			realTableName = modelWithMeta.dbName;
		}
		// Sinon, utiliser le nom Prisma tel quel (pas de nettoyage de préfixe)
		// car si pas de @@map, alors le nom Prisma = nom de table réel en BDD
	}

	// Construire le nom qualifié de la table avec le schéma
	const qualifiedTableName = `"${schema.replaceAll('"', '""')}"."${realTableName.replaceAll('"', '""')}"`;

	// Identifier les colonnes datetime (Date + Timestamp) pour formatage spécial
	const timestampColumns =
		metadata?.fields.filter((f) => f.type === 'DateTime' || f.isTimestamp) ?? [];

	// Identifier les colonnes binaires
	const tableFields = metadata?.fields || [];
	const binaryColumns = tableFields
		.filter(
			(field) =>
				field.type.toLowerCase().includes('byte') ||
				field.name.includes('binary') ||
				field.name.includes('blob')
		)
		.map((field) => field.name);

	// Construction des sélections avec traitement spécial pour les colonnes binaires et timestamps
	let selectColumns = '*';
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

	if (binaryColumns.length > 0 || timestampColumns.length > 0) {
		const columnSelects = tableFields
			.map((field) => {
				if (binaryColumns.includes(field.name)) {
					// Convertir les colonnes binaires en hex
					const hexLimit = maxBinaryLength || (limit ? 50 : 32767); // 50 pour preview, 32767 pour export
					return `CASE WHEN "${field.name}" IS NOT NULL THEN LEFT(encode("${field.name}", 'hex'), ${hexLimit}) ELSE NULL END as "${field.name}"`;
				}
				return `"${field.name}"`;
			})
			.join(', ');
		selectColumns = columnSelects;
	}

	const query = limit
		? `SELECT ${selectColumns}${timestampSelects} FROM ${qualifiedTableName} LIMIT ${limit}`
		: `SELECT ${selectColumns}${timestampSelects} FROM ${qualifiedTableName}`;

	try {
		const prisma = await getClient(database);

		const rawData = (await (
			prisma as { $queryRawUnsafe: (query: string) => Promise<unknown[]> }
		).$queryRawUnsafe(query)) as Record<string, unknown>[];

		// Post-traitement : remplacer les timestamps Date par les versions string avec microsecondes
		// ET convertir tous les Decimal en nombres pour la sérialisation JSON
		console.log('📊 [DEBUG] Données brutes extraites:', rawData.length, 'lignes');
		if (rawData.length > 0) {
			console.log('📊 [DEBUG] Première ligne brute:', rawData[0]);
		}

		data = rawData.map((row, index) => {
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

			// Debug : log première ligne avant conversion
			if (index === 0) {
				console.log('🔍 [DEBUG] Avant serializeData:', processedRow);
			}

			// Convertir tous les Decimal en nombres pour JSON (garde Decimal dans DB, converti pour export)
			const serialized = serializeData(processedRow) as Record<string, unknown>;

			// Debug : log première ligne après conversion
			if (index === 0) {
				console.log('✅ [DEBUG] Après serializeData:', serialized);
			}

			return serialized;
		});
	} catch (err) {
		throw new Error(
			`Erreur lors de l'extraction de ${tableName}: ${err instanceof Error ? err.message : 'Erreur inconnue'}`
		);
	}

	return {
		tableName: realTableName, // Utiliser le nom @@map en priorité
		database,
		schema,
		data,
		columns,
		totalRows: data.length
	};
}

// Fonction pour générer un nom de fichier intelligent et dynamique
export async function generateFileName(
	exportDataList: SharedExportData[],
	format: string
): Promise<string> {
	// Calculer dynamiquement le nombre total de tables disponibles
	const allTables = await getAllDatabaseTables();
	const totalAvailableTables = allTables.length;

	// Déterminer les bases de données utilisées à partir des données exportées
	const usedDatabases = new Set(exportDataList.map((data) => data.database));

	// Préfixe selon les bases utilisées (vraiment dynamique)
	let prefix: string;
	if (usedDatabases.size === 0) {
		prefix = 'export';
	} else if (usedDatabases.size === 1) {
		// Utiliser le vrai nom de base de données tel quel
		prefix = Array.from(usedDatabases)[0] as string;
	} else {
		// Concaténer tous les noms de bases utilisées
		prefix = Array.from(usedDatabases)
			.sort((a, b) => a.localeCompare(b))
			.join('_');
	}

	let tablePart: string;
	const tableNames = exportDataList.map((d) => d.tableName);
	if (tableNames.length === totalAvailableTables) {
		tablePart = 'complet';
	} else if (tableNames.length === 1) {
		tablePart = tableNames[0];
	} else if (tableNames.length <= 3) {
		tablePart = tableNames.join('-');
	} else {
		tablePart = `${tableNames.length}tables`;
	}

	return `${prefix}_${tablePart}.${format}`;
}

// Génération d'un fichier Excel
export async function generateExcelFile(
	exportDataList: SharedExportData[],
	config: ExportConfig
): Promise<ExportFile> {
	const workbook = new ExcelJS.Workbook();
	const usedSheetNames = new Set<string>();

	// Métadonnées du workbook
	workbook.creator = 'CENOV Export System';
	workbook.created = new Date();

	for (const tableData of exportDataList) {
		// Génération simple d'un nom de feuille : nom original + (1), (2) si doublon
		let baseSheetName = tableData.tableName;

		// Limiter à 31 caractères (limite Excel) en gardant de la place pour (X)
		if (baseSheetName.length > 27) {
			baseSheetName = baseSheetName.substring(0, 27);
		}

		// S'assurer de l'unicité avec (1), (2), etc.
		let sheetName = baseSheetName;
		let counter = 1;
		while (usedSheetNames.has(sheetName)) {
			sheetName = `${baseSheetName}(${counter})`;
			counter++;
		}

		usedSheetNames.add(sheetName);

		// Création de la feuille de calcul
		const worksheet = workbook.addWorksheet(sheetName);

		// Configuration des colonnes avec largeur automatique
		const shouldIncludeHeaders = config.includeHeaders !== false;
		worksheet.columns = tableData.columns.map((col) => ({
			header: shouldIncludeHeaders ? col : undefined,
			key: col,
			width: Math.max(col.length, 15)
		}));

		// Ajout des données (si en-têtes inclus, ne pas les ajouter à nouveau)
		if (shouldIncludeHeaders) {
			// Les en-têtes sont déjà dans worksheet.columns
			// Ajouter seulement les données (garder types natifs pour Excel)
			for (const row of tableData.data) {
				const excelRow: Record<string, unknown> = {};
				for (const column of tableData.columns) {
					excelRow[column] = formatValueForExcel(row[column]);
				}
				worksheet.addRow(excelRow);
			}
		} else {
			// Pas d'en-têtes : ajouter toutes les données comme rows simples (garder types natifs)
			for (const row of tableData.data) {
				const excelRow: unknown[] = [];
				for (const column of tableData.columns) {
					const value = formatValueForExcel(row[column]);
					excelRow.push(value);
				}
				worksheet.addRow(excelRow);
			}
		}
	}

	// Génération du buffer (async avec ExcelJS)
	const buffer = await workbook.xlsx.writeBuffer();

	const fileName = await generateFileName(exportDataList, 'xlsx');

	return {
		buffer: Buffer.from(buffer),
		fileName,
		mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		size: buffer.byteLength
	};
}

// Génération d'un fichier CSV
export async function generateCSVFile(
	exportDataList: SharedExportData[],
	config: ExportConfig
): Promise<ExportFile> {
	let csvContent = '';

	for (let i = 0; i < exportDataList.length; i++) {
		const tableData = exportDataList[i];

		// Séparateur entre les tables (sauf pour la première)
		if (i > 0) {
			csvContent += '\n\n';
		}

		// Nom de la table (utilise désormais le nom @@map en priorité)
		csvContent += `# Table: ${tableData.tableName}\n`;

		// En-têtes
		if (config.includeHeaders !== false) {
			csvContent += tableData.columns.join(',') + '\n';
		}

		// Données
		for (const row of tableData.data) {
			const csvRow: string[] = [];
			for (const column of tableData.columns) {
				let value = formatValueForExport(row[column]);

				// Échappement CSV spécifique
				if (value.includes(',') || value.includes('"') || value.includes('\n')) {
					value = `"${value.replaceAll('"', '""')}"`;
				}

				csvRow.push(value);
			}
			csvContent += csvRow.join(',') + '\n';
		}
	}

	// Ajouter BOM UTF-8 pour une meilleure compatibilité
	const csvWithBOM = '\uFEFF' + csvContent;
	const buffer = Buffer.from(csvWithBOM, 'utf-8');
	const fileName = await generateFileName(exportDataList, 'csv');

	return {
		buffer,
		fileName,
		mimeType: 'text/csv; charset=utf-8',
		size: buffer.length
	};
}

// Génération d'un fichier XML
export async function generateXMLFile(exportDataList: SharedExportData[]): Promise<ExportFile> {
	const xmlData: Record<string, unknown> = {
		export: {
			'@_generated': new Date().toISOString(),
			'@_tables': exportDataList.length,
			'@_totalRows': exportDataList.reduce((sum, t) => sum + t.totalRows, 0),
			tables: {
				table: exportDataList.map((tableData) => ({
					'@_name': tableData.tableName,
					'@_rows': tableData.totalRows,
					columns: {
						column: tableData.columns.map((col) => ({
							'@_name': col
						}))
					},
					data: {
						row: tableData.data.map((row) => {
							const xmlRow: Record<string, unknown> = {};
							for (const column of tableData.columns) {
								xmlRow[column] = formatValueForExport(row[column]);
							}
							return xmlRow;
						})
					}
				}))
			}
		}
	};

	const builder = new XMLBuilder({
		ignoreAttributes: false,
		format: true,
		indentBy: '  '
	});

	const xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n' + builder.build(xmlData);
	const buffer = Buffer.from(xmlContent, 'utf-8');
	const fileName = await generateFileName(exportDataList, 'xml');

	return {
		buffer,
		fileName,
		mimeType: 'application/xml',
		size: buffer.length
	};
}

// Génération d'un fichier JSON
export async function generateJSONFile(
	exportDataList: SharedExportData[],
	config: ExportConfig
): Promise<ExportFile> {
	const jsonData = {
		metadata: {
			exportDate: new Date().toISOString(),
			format: 'json',
			includeHeaders: config.includeHeaders,
			rowLimit: config.rowLimit || null,
			totalTables: exportDataList.length,
			totalRows: exportDataList.reduce((sum, t) => sum + t.totalRows, 0)
		},
		databases: exportDataList.reduce(
			(acc, tableData) => {
				if (!acc[tableData.database]) {
					acc[tableData.database] = {
						name: tableData.database,
						tables: {}
					};
				}

				acc[tableData.database].tables[tableData.tableName] = {
					metadata: {
						tableName: tableData.tableName,
						columns: tableData.columns,
						totalRows: tableData.totalRows,
						exportedRows: tableData.data.length
					},
					data: tableData.data
				};

				return acc;
			},
			{} as Record<string, { name: string; tables: Record<string, unknown> }>
		)
	};

	const jsonContent = JSON.stringify(jsonData, null, 2);
	const buffer = Buffer.from(jsonContent, 'utf-8');
	const fileName = await generateFileName(exportDataList, 'json');

	return {
		buffer,
		fileName,
		mimeType: 'application/json',
		size: buffer.length
	};
}
