import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getClient } from '$lib/prisma-meta';
import type { PrismaClient as CenovDevPrismaClient } from '../../generated/prisma-cenov-dev/client';
import { createChildLogger } from '$lib/server/logger';

const log = createChildLogger('import-template');

/**
 * Encode le nom de fichier pour le header Content-Disposition (RFC 5987)
 * Gère les caractères non-ASCII (apostrophes typographiques, accents, etc.)
 */
function sanitizeFilename(filename: string): { ascii: string; encoded: string } {
	// Version ASCII-safe: remplacer les caractères non-ASCII
	const ascii = filename
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '') // Supprimer les accents
		.replace(/['']/g, "'") // Apostrophes typographiques → apostrophe simple
		.replace(/[""]/g, '"') // Guillemets typographiques → guillemets simples
		.replace(/[^\x20-\x7E]/g, '_') // Autres caractères non-ASCII → underscore
		.replace(/\s+/g, '_') // Espaces → underscores
		.replace(/_+/g, '_'); // Multiples underscores → un seul

	// Version encodée UTF-8 pour filename*
	const encoded = encodeURIComponent(filename.replace(/\s+/g, '_'));

	return { ascii, encoded };
}

export const GET: RequestHandler = async ({ url }) => {
	try {
		const cat_code = url.searchParams.get('cat_code');
		const database =
			(url.searchParams.get('database') as 'cenov_dev' | 'cenov_preprod') || 'cenov_dev';

		if (!cat_code) {
			log.warn({ cat_code }, 'Tentative de génération template sans catégorie');
			throw error(400, 'Catégorie non sélectionnée');
		}

		// 1. Charger le client Prisma
		const prisma = (await getClient(database)) as unknown as CenovDevPrismaClient;

		// 2. Charger la catégorie
		const category = await prisma.category.findFirst({
			where: { cat_code }
		});

		if (!category) {
			throw error(404, `Catégorie ${cat_code} introuvable`);
		}

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

		// 6. Générer le CSV (juste la ligne d'en-têtes)
		const csvContent = allHeaders.join(';') + '\n';

		// 7. Retourner le fichier CSV
		const rawFileName = category.cat_label || cat_code;
		const dbPrefix = database === 'cenov_preprod' ? 'preprod' : 'dev';
		const { ascii: safeFileName, encoded: encodedFileName } = sanitizeFilename(rawFileName);
		const fullFileName = `template_${dbPrefix}_${safeFileName}.csv`;
		const fullEncodedFileName = `template_${dbPrefix}_${encodedFileName}.csv`;

		log.info(
			{ cat_code, database, fileName: fullFileName, columnCount: allHeaders.length },
			'Template généré avec succès'
		);

		// RFC 5987: filename pour clients anciens (ASCII), filename* pour UTF-8
		return new Response(csvContent, {
			status: 200,
			headers: {
				'Content-Type': 'text/csv; charset=utf-8',
				'Content-Disposition': `attachment; filename="${fullFileName}"; filename*=UTF-8''${fullEncodedFileName}`
			}
		});
	} catch (err) {
		// Re-throw SvelteKit errors (404, 400, etc.)
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
		log.error({ err, errorMessage }, 'Erreur génération template');

		throw error(500, `Erreur génération template: ${errorMessage}`);
	}
};
