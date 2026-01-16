import { error } from '@sveltejs/kit';
import {
	getExportStats,
	getProductCount,
	getAllProductsSummary,
	getSuppliersList,
	getCategoriesList
} from './repositories/wordpress.repository';
import type { PageServerLoad } from './$types';
import { createChildLogger } from '$lib/server/logger';

const logger = createChildLogger('wordpress-server');

type DatabaseType = 'cenov_dev' | 'cenov_preprod';

/**
 * Charge les statistiques d'export et la liste des produits pour affichage dans l'interface
 * Accessible publiquement
 */
export const load: PageServerLoad = async ({ url }) => {
	try {
		// Récupérer base de données et filtres depuis URL
		const databaseParam = url.searchParams.get('database');
		const database: DatabaseType = databaseParam === 'cenov_preprod' ? 'cenov_preprod' : 'cenov_dev';
		const supplierId = url.searchParams.get('supplier');
		const categoryId = url.searchParams.get('category');

		const filters = {
			supplierId: supplierId ? Number.parseInt(supplierId, 10) : undefined,
			categoryId: categoryId ? Number.parseInt(categoryId, 10) : undefined
		};

		logger.info({ database, filters }, 'Page load - Début du chargement');

		// Charger données pour la base sélectionnée
		logger.debug('Chargement parallèle des données');

		const [stats, products, suppliers, categories] = await Promise.all([
			getExportStats(database),
			getAllProductsSummary(database, filters),
			getSuppliersList(database),
			getCategoriesList(database)
		]);

		logger.debug(
			{
				productsCount: products.length,
				suppliersCount: suppliers.length,
				categoriesCount: categories.length
			},
			'Données chargées avec succès'
		);

		// Charger totaux des deux bases pour l'affichage du sélecteur
		// Utilise getProductCount (SQL brut) pour éviter les problèmes de schéma différent
		logger.debug('Chargement des totaux pour sélecteur BDD');

		const [statsDevTotal, statsPreprodTotal] = await Promise.all([
			database === 'cenov_dev' ? Promise.resolve(stats.total) : getProductCount('cenov_dev'),
			database === 'cenov_preprod' ? Promise.resolve(stats.total) : getProductCount('cenov_preprod')
		]);

		logger.info(
			{
				database,
				dbTotals: { cenov_dev: statsDevTotal, cenov_preprod: statsPreprodTotal }
			},
			'Page load - Chargement terminé avec succès'
		);

		return {
			stats,
			products,
			suppliers,
			categories,
			// Totaux pour le sélecteur de BDD
			dbTotals: {
				cenov_dev: statsDevTotal,
				cenov_preprod: statsPreprodTotal
			},
			// Retourner les filtres actifs pour l'UI
			activeFilters: {
				database,
				supplierId: filters.supplierId ?? null,
				categoryId: filters.categoryId ?? null
			}
		};
	} catch (err) {
		logger.error({ error: err, database: url.searchParams.get('database') }, 'Erreur chargement données WordPress');
		throw error(500, 'Erreur lors du chargement des données');
	}
};
