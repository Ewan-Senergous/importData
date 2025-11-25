import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getClient } from '$lib/prisma-meta';
import type { PrismaClient as CenovDevPrismaClient } from '../../generated/prisma-cenov-dev/client';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const cat_code = url.searchParams.get('cat_code');
		const database =
			(url.searchParams.get('database') as 'cenov_dev' | 'cenov_preprod') || 'cenov_dev';

		if (!cat_code) {
			throw error(400, 'Catégorie non sélectionnée');
		}

		console.log(`🔍 Génération template pour catégorie: ${cat_code} (base: ${database})`);

		// 1. Charger le client Prisma
		const prisma = (await getClient(database)) as unknown as CenovDevPrismaClient;

		// 2. Charger la catégorie
		const category = await prisma.category.findFirst({
			where: { cat_code }
		});

		if (!category) {
			throw error(404, `Catégorie ${cat_code} introuvable`);
		}

		console.log(`✅ Catégorie trouvée: ${category.cat_label} (ID: ${category.cat_id})`);

		// 3. ✅ RÉCUPÉRER HIÉRARCHIE COMPLÈTE (attributs directs + hérités)
		const hierarchy: number[] = [];
		let currentCatId: number | null = category.cat_id;

		// Remonter jusqu'à la racine (fk_parent = null)
		while (currentCatId !== null) {
			hierarchy.push(currentCatId);
			const cat: { fk_parent: number | null } | null = await prisma.category.findUnique({
				where: { cat_id: currentCatId },
				select: { fk_parent: true }
			});
			currentCatId = cat?.fk_parent ?? null;
		}

		console.log(`📈 Hiérarchie: ${hierarchy.length} niveau(x) - IDs: ${hierarchy.join(' → ')}`);

		// 4. Charger TOUS les attributs de la hiérarchie
		const categoryAttributes = await prisma.category_attribute.findMany({
			where: { fk_category: { in: hierarchy } },
			include: {
				attribute: {
					select: { atr_value: true }
				}
			},
			orderBy: {
				attribute: { atr_value: 'asc' }
			}
		});

		console.log(`📊 Attributs trouvés: ${categoryAttributes.length} (directs + hérités)`);

		// 5. Construire les en-têtes CSV
		const metierHeaders = [
			'pro_cenov_id',
			'pro_code',
			'sup_code',
			'sup_label',
			'cat_code',
			'cat_label',
			'fk_document',
			'kit_label',
			'famille',
			'sous_famille',
			'sous_sous_famille',
			'pp_amount',
			'pp_date',
			'pp_discount'
		];

		// ✅ Dédupliquer les attributs (si même attribut dans parent et enfant)
		const uniqueAttributeValues = new Set<string>();
		for (const ca of categoryAttributes) {
			if (ca.attribute.atr_value) {
				uniqueAttributeValues.add(ca.attribute.atr_value);
			}
		}

		const attributeHeaders = Array.from(uniqueAttributeValues).sort((a, b) => a.localeCompare(b));

		const allHeaders = [...metierHeaders, ...attributeHeaders];

		console.log(`📋 En-têtes CSV: ${allHeaders.length} colonnes`);

		// 5. Générer le CSV (juste la ligne d'en-têtes)
		const csvContent = allHeaders.join(';') + '\n';

		console.log(`✅ Template généré avec succès`);

		// 6. Retourner le fichier CSV
		const fileName = category.cat_label?.replaceAll(' ', '_') || cat_code;
		const dbPrefix = database === 'cenov_preprod' ? 'preprod' : 'dev';
		return new Response(csvContent, {
			status: 200,
			headers: {
				'Content-Type': 'text/csv; charset=utf-8',
				'Content-Disposition': `attachment; filename="template_${dbPrefix}_${fileName}.csv"`
			}
		});
	} catch (err) {
		console.error('❌ Erreur génération template:', err);

		if (err && typeof err === 'object' && 'status' in err) {
			throw err; // Re-throw SvelteKit errors
		}

		throw error(
			500,
			`Erreur génération template: ${err instanceof Error ? err.message : 'Erreur inconnue'}`
		);
	}
};
