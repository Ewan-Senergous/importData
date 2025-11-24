import { error } from '@sveltejs/kit';
import { protect } from '$lib/auth/protect';
import { getProductsForWordPress } from './repositories/wordpress.repository';
import { generateWordPressCSV } from './services/wordpress.csv-generator';
import type { RequestHandler } from './$types';

/**
 * API GET pour téléchargement direct du CSV WordPress
 * Alternative à l'action POST dans +page.server.ts
 *
 * Usage : GET /wordpress?format=csv
 * Retourne : Fichier CSV wordpress_products_YYYY-MM-DD.csv
 */
export const GET: RequestHandler = async (event) => {
	console.log('🟢 GET /wordpress endpoint appelé');
	console.log('🟢 Query params:', event.url.searchParams.toString());
	console.log('🟢 URL complète:', event.url.href);

	try {
		console.log('🔐 Vérification authentification...');
		await protect(event);
		console.log('✅ Authentification OK');

		console.log('📥 Démarrage export WordPress (API GET)...');

		// Parser les IDs depuis query params
		const idsParam = event.url.searchParams.get('ids');
		const productIds = idsParam
			? idsParam
					.split(',')
					.map(Number)
					.filter((id) => !Number.isNaN(id))
			: undefined;

		console.log(
			'🔵 Export:',
			productIds ? `${productIds.length} produits sélectionnés` : 'tous les produits'
		);

		// Récupérer les produits (filtrés ou tous)
		console.log('🔵 Récupération produits depuis CENOV_DEV...');
		const products = await getProductsForWordPress(productIds);
		console.log(`✅ ${products.length} produits récupérés`);

		// Générer le CSV
		console.log('🔵 Génération du CSV...');
		const csv = generateWordPressCSV(products);
		console.log(`✅ CSV généré (${csv.length} caractères)`);

		// Générer nom de fichier avec timestamp
		const timestamp = new Date().toISOString().split('T')[0];
		let filename: string;

		if (productIds && productIds.length === 1 && products.length === 1) {
			// Un seul produit : utiliser son pro_cenov_id (sku)
			const productSku = products[0].sku || 'product';
			filename = `${productSku}.csv`;
		} else if (productIds && productIds.length > 0) {
			// Plusieurs produits sélectionnés : nom avec date
			filename = `wordpress_products_selection_${timestamp}.csv`;
		} else {
			// Tous les produits : nom avec date
			filename = `wordpress_products_all_${timestamp}.csv`;
		}

		console.log(`✅ Export WordPress terminé : ${filename}`);
		console.log('🟢 Envoi de la réponse avec headers de téléchargement...');

		// Retourner le fichier CSV
		return new Response(csv, {
			headers: {
				'Content-Type': 'text/csv; charset=utf-8',
				'Content-Disposition': `attachment; filename="${filename}"`
			}
		});
	} catch (err) {
		console.error('❌ Erreur export WordPress (API GET):', err);
		console.error('❌ Stack trace:', err instanceof Error ? err.stack : 'No stack');
		throw error(500, 'Erreur lors de la génération du CSV');
	}
};
