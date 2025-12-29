import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { DatabaseName } from '$lib/prisma-meta';
import { getTableData } from '../../repositories/explorer.repository';

export const POST: RequestHandler = async ({ request }) => {
	const { database, tableName, page } = await request.json();

	try {
		const result = await getTableData(database as DatabaseName, tableName, {
			page: page || 1,
			limit: 500
		});

		return json({
			success: true,
			data: result.data,
			total: result.total,
			metadata: result.metadata
		});
	} catch (error) {
		console.error('Erreur lors du chargement de la table:', error);
		return json(
			{
				success: false,
				error: 'Erreur lors du chargement de la table'
			},
			{ status: 500 }
		);
	}
};
