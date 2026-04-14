import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { DatabaseName } from '$lib/prisma-meta';
import { getTableInfo, insertRows } from './repositories/import-csv-bdd.repository';
import { parseCSV, validateImport, coerceRows } from './services/import-csv-bdd.service';
import { createChildLogger } from '$lib/server/logger';

const log = createChildLogger('import-csv-bdd:server');

const VALID_DATABASES = new Set<DatabaseName>(['cenov', 'cenov_dev', 'cenov_preprod']);

function formatError(err: unknown): string {
	return err instanceof Error ? err.message : 'Erreur inconnue';
}

// ============================================================================
// LOAD
// ============================================================================

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(302, '/auth');
	}

	return { isAuthenticated: true };
};

// ============================================================================
// ACTIONS
// ============================================================================

export const actions: Actions = {
	validate: async ({ request, locals }) => {
		if (!locals.user) return fail(403, { error: 'Authentification requise.' });

		try {
			const formData = await request.formData();
			const csvContent = formData.get('csv');
			const database = formData.get('database') as DatabaseName;

			if (!csvContent || typeof csvContent !== 'string' || csvContent.trim() === '') {
				return fail(400, { error: 'Fichier CSV manquant ou vide.' });
			}
			if (!database || !VALID_DATABASES.has(database)) {
				return fail(400, { error: 'Base de données invalide.' });
			}

			log.info({ database, csvLength: csvContent.length }, 'Validation CSV commencee');

			const parsed = parseCSV(csvContent);
			if (!parsed) {
				log.warn({ database }, 'Format CSV invalide - header "# Table:" manquant');
				return fail(400, {
					error: 'Format CSV invalide. La ligne 1 doit commencer par "# Table: <nom>".'
				});
			}

			log.info(
				{ database, table: parsed.tableName, headers: parsed.headers.length, rows: parsed.rows.length },
				'CSV parse avec succes'
			);

			const tableInfo = await getTableInfo(database, parsed.tableName);
			if (!tableInfo) {
				log.warn({ database, table: parsed.tableName }, 'Table introuvable en BDD');
				return fail(400, {
					error: `Table "${parsed.tableName}" introuvable dans les schémas public/produit/sas.`
				});
			}

			const validation = validateImport(parsed, tableInfo);
			log.info(
				{
					database,
					table: parsed.tableName,
					schema: tableInfo.schemaName,
					activeColumns: validation.activeColumns.length,
					ignoredColumns: validation.ignoredColumns.length,
					validRows: validation.validRows,
					totalRows: validation.totalRows,
					errors: validation.errors.length,
					warnings: validation.warnings.length
				},
				'Validation terminee'
			);

			return { validation };
		} catch (err) {
			log.error({ err }, 'Erreur inattendue lors de la validation');
			return fail(500, { error: `Erreur de validation: ${formatError(err)}` });
		}
	},

	process: async ({ request, locals }) => {
		if (!locals.user) return fail(403, { error: 'Authentification requise.' });

		try {
			const formData = await request.formData();
			const csvContent = formData.get('csv');
			const database = formData.get('database') as DatabaseName;

			if (!csvContent || typeof csvContent !== 'string' || csvContent.trim() === '') {
				return fail(400, { error: 'Fichier CSV manquant ou vide.' });
			}
			if (!database || !VALID_DATABASES.has(database)) {
				return fail(400, { error: 'Base de données invalide.' });
			}

			log.info({ database, csvLength: csvContent.length }, 'Import CSV commence');

			const parsed = parseCSV(csvContent);
			if (!parsed) {
				log.warn({ database }, 'Format CSV invalide lors de l import');
				return fail(400, { error: 'Format CSV invalide.' });
			}

			const tableInfo = await getTableInfo(database, parsed.tableName);
			if (!tableInfo) {
				log.warn({ database, table: parsed.tableName }, 'Table introuvable lors de l import');
				return fail(400, { error: `Table "${parsed.tableName}" introuvable.` });
			}

			// Re-valider avant import
			const validation = validateImport(parsed, tableInfo);
			if (!validation.success && validation.errors.length > 0) {
				log.warn(
					{ database, table: parsed.tableName, errors: validation.errors.length },
					'Import refuse - erreurs de validation'
				);
				return fail(400, { error: 'Validation échouée. Corrigez les erreurs.' });
			}

			log.info(
				{
					database,
					table: parsed.tableName,
					schema: tableInfo.schemaName,
					columns: validation.activeColumns.length,
					rows: parsed.rows.length,
					upsertKey: tableInfo.upsertKey
				},
				'Coercition et insertion en cours'
			);

			// Coercition et import
			const typedRows = coerceRows(parsed.rows, validation.activeColumns, tableInfo.columns);
			const result = await insertRows(database, tableInfo, validation.activeColumns, typedRows);

			log.info(
				{
					database,
					table: parsed.tableName,
					inserted: result.inserted,
					updated: result.updated,
					errors: result.errors.length
				},
				'Import termine'
			);

			return { result };
		} catch (err) {
			log.error({ err }, 'Erreur inattendue lors de l import');
			return fail(500, { error: `Erreur d'importation: ${formatError(err)}` });
		}
	}
};
