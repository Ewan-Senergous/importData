import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { z } from 'zod/v4';
import { superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import {
	getAllDatabaseTables,
	getTableMetadata,
	countTableRows,
	getAllDatabaseNames,
	type TableInfo as PrismaTableInfo,
	type FieldInfo,
	type DatabaseName
} from '$lib/prisma-meta';
import {
	extractTableData,
	generateExcelFile,
	generateCSVFile,
	generateXMLFile,
	generateJSONFile,
	type ExportFile
} from './export-server-logic';

// Type pour les données extraites
export interface SharedExportData {
	tableName: string;
	database: DatabaseName;
	schema: string;
	data: Record<string, unknown>[];
	columns: string[];
	totalRows: number;
}

// Options d'extraction
export interface ExtractionOptions {
	limit?: number;
	maxBinaryLength?: number;
}

// Types pour l'export
export interface ExportConfig {
	selectedSources: string[];
	format: 'xlsx' | 'csv' | 'xml' | 'json';
	includeRelations: boolean;
	rowLimit?: number;
	filters: Record<string, unknown>;
	includeHeaders: boolean;
}

// Extension de TableInfo pour inclure les données d'export
export interface ExportTableInfo extends PrismaTableInfo {
	columns: FieldInfo[];
	relations?: string[];
	formattedRowCount?: string; // Nombre de lignes formaté côté serveur
}

export interface ExportResult {
	success: boolean;
	message: string;
	downloadUrl?: string;
	fileName?: string;
	fileSize?: number;
	exportedRows: number;
	warnings: string[];
	errors: string[];
	needsClientDownload?: boolean;
}

// Configuration des formats d'export (centralisé pour éliminer duplication)
const EXPORT_FORMATS_CONFIG = {
	csv: {
		value: 'csv',
		label: 'CSV (.csv)',
		description: 'Fichier texte séparé par des virgules',
		mimeType: 'text/csv; charset=utf-8',
		recommended: true
	},
	xlsx: {
		value: 'xlsx',
		label: 'Excel (.xlsx)',
		description: 'Classeur Excel avec plusieurs feuilles',
		mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		recommended: false
	},
	json: {
		value: 'json',
		label: 'JSON (.json)',
		description: 'Structure de données avec métadonnées',
		mimeType: 'application/json',
		recommended: false
	},
	xml: {
		value: 'xml',
		label: 'XML (.xml)',
		description: 'Données structurées en XML',
		mimeType: 'application/xml',
		recommended: false
	}
} as const;

// Fonction utilitaire pour les formats valides
function getValidFormats(): string[] {
	return Object.keys(EXPORT_FORMATS_CONFIG);
}

// Schéma de validation pour l'export
const exportSchema = z.object({
	selectedSources: z.array(z.string()).min(1, 'Sélectionnez au moins une source'),
	format: z.enum(['csv', 'xlsx', 'json', 'xml'], {
		error: 'Format non supporté'
	}),
	includeRelations: z.boolean().default(false),
	rowLimit: z.number().min(1).max(1000000).optional(),
	filters: z.record(z.string(), z.unknown()).default({}),
	includeHeaders: z.boolean().default(true),
	dateRange: z
		.object({
			from: z.string().optional(),
			to: z.string().optional()
		})
		.optional()
});

// Fonction de formatage pour les nombres (utilisée côté serveur)
export function _formatNumber(num: number): string {
	return new Intl.NumberFormat('fr-FR').format(num);
}

// Génération des informations d'export à partir des métadonnées Prisma
async function generateExportTables(): Promise<ExportTableInfo[]> {
	// Récupérer toutes les tables des deux bases de données
	const tables = await getAllDatabaseTables();

	const tablesWithMetadata = await Promise.all(
		tables.map(async (table) => {
			const metadata = await getTableMetadata(table.database, table.name);
			const columns: FieldInfo[] = metadata?.fields || [];

			return {
				...table,
				columns,
				relations: []
			};
		})
	);

	return tablesWithMetadata;
}

// Obtenir les informations sur les tables avec le compte de lignes
async function getTablesInfo(): Promise<ExportTableInfo[]> {
	const availableTables = await generateExportTables();

	const tablesWithCounts = await Promise.all(
		availableTables.map(async (table) => {
			try {
				const count = await countTableRows(table.database, table.name);
				return {
					...table,
					rowCount: count,
					formattedRowCount: _formatNumber(count) // Formatage côté serveur
				};
			} catch {
				return {
					...table,
					rowCount: 0,
					formattedRowCount: '0' // Formatage côté serveur
				};
			}
		})
	);

	return tablesWithCounts;
}

export const load = (async (event) => {
	const { depends } = event;
	depends('app:export');

	try {
		const tables = await getTablesInfo();
		const form = await superValidate(zod4(exportSchema));

		form.data = {
			selectedSources: [],
			format: 'csv',
			includeRelations: false,
			filters: {},
			includeHeaders: true
		};

		const totalRows = tables.reduce((sum, table) => sum + (table.rowCount || 0), 0);
		const databases = await getAllDatabaseNames();

		return {
			form,
			tables,
			databases, // Liste dynamique des bases de données
			totalTables: tables.length,
			totalRows,
			formattedTotalRows: _formatNumber(totalRows), // Formatage côté serveur
			exportFormats: Object.values(EXPORT_FORMATS_CONFIG) // Données statiques, pas de fonction
		};
	} catch (err) {
		throw error(
			500,
			`Erreur lors du chargement de la page export: ${err instanceof Error ? err.message : 'Erreur inconnue'}`
		);
	}
}) satisfies PageServerLoad;

export const actions: Actions = {
	preview: async (event) => {
		const { request } = event;
		const form = await superValidate(request, zod4(exportSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			const { selectedSources } = form.data;
			const previewData: Record<string, unknown[]> = {};

			// Récupérer un aperçu des données pour chaque table sélectionnée
			for (const tableId of selectedSources) {
				try {
					const tableData: SharedExportData = await extractTableData(tableId, {
						limit: 6,
						maxBinaryLength: 50 // Limite pour preview
					});

					// Utiliser l'ID complet (database-tablename) pour éviter les collisions
					const tableName = tableId.includes('-') ? tableId.split('-').slice(1).join('-') : tableId;
					const previewKey = `${tableData.database}-${tableName}`;
					previewData[previewKey] = tableData.data;
				} catch (error) {
					console.error(
						`❌ [PREVIEW] Erreur lors de la récupération des données pour ${tableId}:`,
						error instanceof Error ? error.message : 'Erreur inconnue'
					);

					// Parser tableId pour créer la clé de preview même en cas d'erreur
					let previewKey: string;
					if (tableId.includes('-')) {
						previewKey = tableId;
					} else {
						// Fallback pour compatibilité
						const allTables = await getAllDatabaseTables();
						const tableInfo = allTables.find((t) => t.name === tableId);
						previewKey = tableInfo ? `${tableInfo.database}-${tableInfo.name}` : tableId;
					}
					previewData[previewKey] = [];
				}
			}

			return {
				form,
				success: true,
				preview: previewData,
				previewConfig: { includeHeaders: form.data.includeHeaders }
			};
		} catch {
			return fail(500, {
				form,
				error: "Erreur lors de l'aperçu des données"
			});
		}
	},

	export: async (event) => {
		const { request } = event;
		const form = await superValidate(request, zod4(exportSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			const config: ExportConfig = form.data;

			// Validation des données
			if (!config.selectedSources || config.selectedSources.length === 0) {
				return fail(400, {
					form,
					error: "Aucune table sélectionnée pour l'export"
				});
			}

			const supportedFormats = getValidFormats();
			if (!supportedFormats.includes(config.format)) {
				return fail(400, {
					form,
					error: `Format non supporté: ${config.format}`
				});
			}

			// Collecte des données à exporter
			const exportDataList: SharedExportData[] = [];
			const warnings: string[] = [];
			const errors: string[] = [];
			let totalExportedRows = 0;

			for (const tableId of config.selectedSources) {
				try {
					const sharedTableData = await extractTableData(tableId, {
						limit: config.rowLimit,
						maxBinaryLength: undefined // Pas de limite pour export complet
					});

					// Utiliser directement SharedExportData (pas besoin d'adaptation)
					const tableData: SharedExportData = sharedTableData;

					exportDataList.push(tableData);
					totalExportedRows += tableData.totalRows;

					if (config.rowLimit && tableData.totalRows >= config.rowLimit) {
						warnings.push(
							`Table ${tableData.tableName}: limite de ${config.rowLimit} lignes appliquée`
						);
					}
				} catch (err) {
					console.error(`❌ [EXPORT] Erreur avec ${tableId}:`, err);
					errors.push(
						`Erreur lors de l'extraction de ${tableId}: ${err instanceof Error ? err.message : 'Erreur inconnue'}`
					);
				}
			}

			if (exportDataList.length === 0) {
				return fail(500, {
					form,
					error: "Aucune donnée n'a pu être extraite"
				});
			}

			// Génération du fichier selon le format
			let exportFile: ExportFile;

			switch (config.format) {
				case 'xlsx':
					exportFile = await generateExcelFile(exportDataList, config);
					break;
				case 'csv':
					exportFile = await generateCSVFile(exportDataList, config);
					break;
				case 'xml':
					exportFile = await generateXMLFile(exportDataList);
					break;
				case 'json':
					exportFile = await generateJSONFile(exportDataList, config);
					break;
				default:
					return fail(400, {
						form,
						error: `Format non implémenté: ${config.format}`
					});
			}

			// Création du résultat avec le fichier à télécharger
			const result: ExportResult = {
				success: true,
				message: `Export terminé avec succès (${totalExportedRows} lignes)`,
				fileName: exportFile.fileName,
				fileSize: exportFile.size,
				exportedRows: totalExportedRows,
				warnings,
				errors,
				needsClientDownload: true
			};

			// Encoder le fichier en base64 pour transmission via form action
			const fileBase64 = exportFile.buffer.toString('base64');

			return {
				form,
				success: true,
				result,
				fileData: {
					content: fileBase64,
					fileName: exportFile.fileName,
					mimeType: exportFile.mimeType,
					size: exportFile.size
				}
			};
		} catch (err) {
			console.error('❌ [EXPORT] Erreur générale:', err);

			return fail(500, {
				form,
				error: `Erreur lors de l'export: ${err instanceof Error ? err.message : 'Erreur inconnue'}`
			});
		}
	}
};
