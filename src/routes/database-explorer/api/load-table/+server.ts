import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { DatabaseName } from '$lib/prisma-meta';
import { getTableData } from '../../repositories/explorer.repository';
import { createChildLogger } from '$lib/server/logger';
import { z } from 'zod/v4';

const logger = createChildLogger('database-explorer-api');

const LoadTableSchema = z.object({
	database: z.enum(['cenov', 'cenov_dev', 'cenov_preprod']),
	schema: z
		.string()
		.min(1)
		.max(100)
		.regex(/^[a-z_][a-z0-9_]*$/i),
	tableName: z
		.string()
		.min(1)
		.max(100)
		.regex(/^[a-z_][a-z0-9_]*$/i),
	page: z.number().int().min(1).max(10000).default(1),
	sortField: z
		.string()
		.min(1)
		.max(100)
		.regex(/^[a-z_][a-z0-9_]*$/i)
		.optional(),
	sortOrder: z.enum(['asc', 'desc']).optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
	const { requestId } = locals;
	const body = await request.json();

	const validation = LoadTableSchema.safeParse(body);
	if (!validation.success) {
		logger.warn({ requestId, errors: validation.error.issues }, 'Invalid request parameters');
		return json(
			{
				success: false,
				error: 'Paramètres invalides',
				details: validation.error.issues
			},
			{ status: 400 }
		);
	}

	const { database, schema, tableName, page, sortField, sortOrder } = validation.data;

	logger.info(
		{ requestId, database, schema, tableName, page, sortField, sortOrder },
		'Loading table data'
	);

	try {
		const startTime = Date.now();
		const result = await getTableData(database as DatabaseName, tableName, {
			page: page || 1,
			limit: 500,
			schema: schema || 'public',
			orderBy: sortField && sortOrder ? { field: sortField, order: sortOrder } : undefined
		});

		const duration = Date.now() - startTime;

		logger.info(
			{
				requestId,
				database,
				tableName,
				rowCount: result.data.length,
				total: result.total,
				duration
			},
			'Table data loaded successfully'
		);

		return json({
			success: true,
			data: result.data,
			total: result.total,
			metadata: result.metadata
		});
	} catch (error) {
		logger.error(
			{
				requestId,
				database,
				tableName,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined
			},
			'Failed to load table data'
		);

		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Erreur lors du chargement de la table'
			},
			{ status: 500 }
		);
	}
};
