import { error } from '@sveltejs/kit';
import { getExportStats, getAllProductsSummary } from './repositories/wordpress.repository';
import type { PageServerLoad } from './$types';

/**
 * Charge les statistiques d'export et la liste des produits pour affichage dans l'interface
 * Accessible publiquement
 */
export const load: PageServerLoad = async () => {
	try {
		const [stats, products] = await Promise.all([getExportStats(), getAllProductsSummary()]);

		return { stats, products };
	} catch (err) {
		console.error('Erreur chargement données WordPress:', err);
		throw error(500, 'Erreur lors du chargement des données');
	}
};
