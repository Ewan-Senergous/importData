import { error } from '@sveltejs/kit';
import {
	getExportStats,
	getAllProductsSummary,
	getSuppliersList,
	getCategoriesList
} from './repositories/wordpress.repository';
import type { PageServerLoad } from './$types';

/**
 * Charge les statistiques d'export et la liste des produits pour affichage dans l'interface
 * Accessible publiquement
 */
export const load: PageServerLoad = async ({ url }) => {
	try {
		// Récupérer filtres depuis URL
		const supplierId = url.searchParams.get('supplier');
		const categoryId = url.searchParams.get('category');

		const filters = {
			supplierId: supplierId ? Number.parseInt(supplierId, 10) : undefined,
			categoryId: categoryId ? Number.parseInt(categoryId, 10) : undefined
		};

		console.log('🔍 [LOAD] Filtres URL:', filters);

		const [stats, products, suppliers, categories] = await Promise.all([
			getExportStats(),
			getAllProductsSummary(filters),
			getSuppliersList(),
			getCategoriesList()
		]);

		return {
			stats,
			products,
			suppliers,
			categories,
			// Retourner les filtres actifs pour l'UI
			activeFilters: {
				supplierId: filters.supplierId ?? null,
				categoryId: filters.categoryId ?? null
			}
		};
	} catch (err) {
		console.error('Erreur chargement données WordPress:', err);
		throw error(500, 'Erreur lors du chargement des données');
	}
};
