import { getClient } from '$lib/prisma-meta';
import type { PrismaClient as CenovDevPrismaClient } from '../../../generated/prisma-cenov-dev/client';
import type { PrismaClient as CenovPreprodPrismaClient } from '../../../generated/prisma-cenov-preprod/client';
import { createChildLogger } from '$lib/server/logger';

const logger = createChildLogger('wordpress');

export type DatabaseType = 'cenov_dev' | 'cenov_preprod';

export interface WordPressAttribute {
	name: string;
	value: string;
	visible: boolean;
	global: boolean;
}

export interface WordPressProduct {
	type: string;
	sku: string;
	name: string | null;
	published: boolean;
	featured: boolean;
	visibility: string;
	short_description: string | null;
	description: string | null;
	in_stock: boolean;
	regular_price: string | null;
	categories: string | null; // Hiérarchies séparées par ", " (ex: "Cat A > Sub A, Cat B > Sub B")
	images: string | null;
	brand: string | null;
	attributes: WordPressAttribute[];
}

export interface ProductSummary {
	pro_id: number;
	pro_cenov_id: string | null;
	pro_name: string | null;
}

/**
 * Charge les attributs pour une liste de produits
 * AUCUN filtre appliqué : exporte TOUS les attributs avec leurs valeurs brutes
 * Tri : par kat_id croissant
 */
async function getProductAttributes(
	database: DatabaseType,
	productIds: number[]
): Promise<Map<number, WordPressAttribute[]>> {
	if (productIds.length === 0) return new Map();

	const prisma = (await getClient(database)) as unknown as CenovDevPrismaClient;

	// CENOV_DEV a les champs kat_visible et kat_global
	// CENOV_PREPROD n'a PAS ces champs
	const hasExtendedFields = database === 'cenov_dev';

	// Charger produits avec leurs kits et attributs
	const products = hasExtendedFields
		? await prisma.product.findMany({
				where: { pro_id: { in: productIds } },
				select: {
					pro_id: true,
					fk_kit: true,
					kit: {
						select: {
							kit_attribute: {
								select: {
									kat_id: true,
									kat_value: true,
									kat_visible: true,
									kat_global: true,
									attribute_kit_attribute_fk_attribute_characteristicToattribute: {
										select: {
											atr_value: true
										}
									}
								},
								orderBy: { kat_id: 'asc' }
							}
						}
					}
				}
			})
		: await prisma.product.findMany({
				where: { pro_id: { in: productIds } },
				select: {
					pro_id: true,
					fk_kit: true,
					kit: {
						select: {
							kit_attribute: {
								select: {
									kat_id: true,
									kat_value: true,
									attribute_kit_attribute_fk_attribute_characteristicToattribute: {
										select: {
											atr_value: true
										}
									}
								},
								orderBy: { kat_id: 'asc' }
							}
						}
					}
				}
			});

	// Grouper attributs par pro_id
	const attributesMap = new Map<number, WordPressAttribute[]>();

	for (const product of products) {
		const attributes: WordPressAttribute[] = [];

		if (product.kit) {
			for (const ka of product.kit.kit_attribute) {
				const atrValue =
					ka.attribute_kit_attribute_fk_attribute_characteristicToattribute.atr_value;

				// Garder valeur brute de la BDD (même NULL, !NP!, etc.)
				const value = ka.kat_value || '';

				attributes.push({
					name: atrValue || '',
					value,
					// CENOV_PREPROD : valeurs par défaut car champs absents
					visible: hasExtendedFields && 'kat_visible' in ka ? ka.kat_visible ?? true : true,
					global: hasExtendedFields && 'kat_global' in ka ? ka.kat_global ?? true : true
				});
			}
		}

		attributesMap.set(product.pro_id, attributes);
	}

	return attributesMap;
}

/**
 * Récupère tous les produits formatés pour l'export WordPress/WooCommerce
 * @param database - Base de données cible (cenov_dev ou cenov_preprod)
 * @param productIds - Liste optionnelle d'IDs de produits à exporter (si vide, exporte tous)
 * @returns Liste des produits avec tous les champs requis par WordPress
 */
export async function getProductsForWordPress(
	database: DatabaseType = 'cenov_dev',
	productIds?: number[]
): Promise<WordPressProduct[]> {
	logger.debug(
		{ database, productIdsCount: productIds?.length || 0 },
		'getProductsForWordPress - Début'
	);

	const prisma = (await getClient(database)) as unknown as CenovDevPrismaClient;

	// ⚠️ cenov_preprod n'a pas les champs: pro_name, pro_type, is_published, is_featured, pro_visibility, pro_description, pro_short_description, in_stock
	const hasExtendedFields = database === 'cenov_dev';

	logger.debug({ hasExtendedFields }, 'Schéma détecté pour export WordPress');

	// Si des IDs sont fournis, filtrer les produits
	if (productIds && productIds.length > 0) {
		logger.info({ productIdsCount: productIds.length }, 'Export WordPress avec sélection');

		const products = hasExtendedFields
			? await prisma.$queryRaw<Array<WordPressProduct & { pro_id: number }>>`
					WITH RECURSIVE category_hierarchy AS (
						SELECT
							cat_id, fk_parent, cat_label, cat_wp_name,
							COALESCE(cat_wp_name, cat_label) as display_name,
							COALESCE(cat_wp_name, cat_label)::TEXT as path,
							1 as level
						FROM produit.category
						WHERE fk_parent IS NULL

						UNION ALL

						SELECT
							c.cat_id, c.fk_parent, c.cat_label, c.cat_wp_name,
							COALESCE(c.cat_wp_name, c.cat_label),
							ch.path || ' > ' || COALESCE(c.cat_wp_name, c.cat_label),
							ch.level + 1
						FROM produit.category c
						INNER JOIN category_hierarchy ch ON c.fk_parent = ch.cat_id
						WHERE ch.level < 10
					)
					SELECT
						p.pro_id,
						COALESCE(p.pro_type::text, 'simple') AS type,
						p.pro_cenov_id AS sku,
						p.pro_name AS name,
						COALESCE(p.is_published, false) AS published,
						COALESCE(p.is_featured, false) AS featured,
						COALESCE(p.pro_visibility::text, 'visible') AS visibility,
						p.pro_short_description AS short_description,
						p.pro_description AS description,
						COALESCE(p.in_stock, true) AS in_stock,
						pp.pp_amount::TEXT AS regular_price,
						STRING_AGG(DISTINCT ch.path, ', ' ORDER BY ch.path) AS categories,
						d.doc_link_source AS images,
						s.sup_label AS brand
					FROM produit.product p
					LEFT JOIN LATERAL (
						SELECT pp_amount FROM produit.price_purchase
						WHERE fk_product = p.pro_id ORDER BY pp_date DESC LIMIT 1
					) pp ON true
					LEFT JOIN LATERAL (
						SELECT doc_link_source FROM public.document
						WHERE product_id = p.pro_id AND is_active = true
						ORDER BY created_at DESC LIMIT 1
					) d ON true
					LEFT JOIN public.supplier s ON p.fk_supplier = s.sup_id
					LEFT JOIN produit.product_category pc ON p.pro_id = pc.fk_product
					LEFT JOIN category_hierarchy ch ON pc.fk_category = ch.cat_id
					WHERE p.pro_cenov_id IS NOT NULL AND p.pro_id = ANY(${productIds}::int[])
					GROUP BY p.pro_id, p.pro_type, p.pro_cenov_id, p.pro_name, p.is_published,
									 p.is_featured, p.pro_visibility, p.pro_short_description, p.pro_description,
									 p.in_stock, pp.pp_amount, d.doc_link_source, s.sup_label
					ORDER BY p.pro_id ASC
				`
			: await prisma.$queryRaw<Array<WordPressProduct & { pro_id: number }>>`
					WITH RECURSIVE category_hierarchy AS (
						SELECT
							cat_id, fk_parent, cat_label, cat_wp_name,
							COALESCE(cat_wp_name, cat_label) as display_name,
							COALESCE(cat_wp_name, cat_label)::TEXT as path,
							1 as level
						FROM produit.category
						WHERE fk_parent IS NULL

						UNION ALL

						SELECT
							c.cat_id, c.fk_parent, c.cat_label, c.cat_wp_name,
							COALESCE(c.cat_wp_name, c.cat_label),
							ch.path || ' > ' || COALESCE(c.cat_wp_name, c.cat_label),
							ch.level + 1
						FROM produit.category c
						INNER JOIN category_hierarchy ch ON c.fk_parent = ch.cat_id
						WHERE ch.level < 10
					)
					SELECT
						p.pro_id,
						'simple'::text AS type,
						p.pro_cenov_id AS sku,
						NULL::varchar AS name,
						false AS published,
						false AS featured,
						'visible'::text AS visibility,
						NULL::text AS short_description,
						NULL::text AS description,
						true AS in_stock,
						pp.pp_amount::TEXT AS regular_price,
						STRING_AGG(DISTINCT ch.path, ', ' ORDER BY ch.path) AS categories,
						d.doc_link_source AS images,
						s.sup_label AS brand
					FROM produit.product p
					LEFT JOIN LATERAL (
						SELECT pp_amount FROM produit.price_purchase
						WHERE fk_product = p.pro_id ORDER BY pp_date DESC LIMIT 1
					) pp ON true
					LEFT JOIN LATERAL (
						SELECT doc_link_source FROM public.document
						WHERE product_id = p.pro_id AND is_active = true
						ORDER BY created_at DESC LIMIT 1
					) d ON true
					LEFT JOIN public.supplier s ON p.fk_supplier = s.sup_id
					LEFT JOIN produit.product_category pc ON p.pro_id = pc.fk_product
					LEFT JOIN category_hierarchy ch ON pc.fk_category = ch.cat_id
					WHERE p.pro_cenov_id IS NOT NULL AND p.pro_id = ANY(${productIds}::int[])
					GROUP BY p.pro_id, p.pro_cenov_id, pp.pp_amount, d.doc_link_source, s.sup_label
					ORDER BY p.pro_id ASC
				`;

		const attributesMap = await getProductAttributes(database, productIds);
		logger.info({ count: products.length }, 'Export WordPress résultat');

		return products.map((p) => ({
			...p,
			attributes: attributesMap.get(p.pro_id) || []
		}));
	}

	// Sinon, retourner tous les produits
	logger.info('Export WordPress complet (tous les produits)');

	const products = hasExtendedFields
		? await prisma.$queryRaw<Array<WordPressProduct & { pro_id: number }>>`
				WITH RECURSIVE category_hierarchy AS (
					SELECT
						cat_id, fk_parent, cat_label, cat_wp_name,
						COALESCE(cat_wp_name, cat_label) as display_name,
						COALESCE(cat_wp_name, cat_label)::TEXT as path,
						1 as level
					FROM produit.category
					WHERE fk_parent IS NULL

					UNION ALL

					SELECT
						c.cat_id, c.fk_parent, c.cat_label, c.cat_wp_name,
						COALESCE(c.cat_wp_name, c.cat_label),
						ch.path || ' > ' || COALESCE(c.cat_wp_name, c.cat_label),
						ch.level + 1
					FROM produit.category c
					INNER JOIN category_hierarchy ch ON c.fk_parent = ch.cat_id
					WHERE ch.level < 10
				)
				SELECT
					p.pro_id,
					COALESCE(p.pro_type::text, 'simple') AS type,
					p.pro_cenov_id AS sku,
					p.pro_name AS name,
					COALESCE(p.is_published, false) AS published,
					COALESCE(p.is_featured, false) AS featured,
					COALESCE(p.pro_visibility::text, 'visible') AS visibility,
					p.pro_short_description AS short_description,
					p.pro_description AS description,
					COALESCE(p.in_stock, true) AS in_stock,
					pp.pp_amount::TEXT AS regular_price,
					STRING_AGG(DISTINCT ch.path, ', ' ORDER BY ch.path) AS categories,
					d.doc_link_source AS images,
					s.sup_label AS brand
				FROM produit.product p
				LEFT JOIN LATERAL (
					SELECT pp_amount FROM produit.price_purchase
					WHERE fk_product = p.pro_id ORDER BY pp_date DESC LIMIT 1
				) pp ON true
				LEFT JOIN LATERAL (
					SELECT doc_link_source FROM public.document
					WHERE product_id = p.pro_id AND is_active = true
					ORDER BY created_at DESC LIMIT 1
				) d ON true
				LEFT JOIN public.supplier s ON p.fk_supplier = s.sup_id
				LEFT JOIN produit.product_category pc ON p.pro_id = pc.fk_product
				LEFT JOIN category_hierarchy ch ON pc.fk_category = ch.cat_id
				WHERE p.pro_cenov_id IS NOT NULL
				GROUP BY p.pro_id, p.pro_type, p.pro_cenov_id, p.pro_name, p.is_published,
								 p.is_featured, p.pro_visibility, p.pro_short_description, p.pro_description,
								 p.in_stock, pp.pp_amount, d.doc_link_source, s.sup_label
				ORDER BY p.pro_id ASC
			`
		: await prisma.$queryRaw<Array<WordPressProduct & { pro_id: number }>>`
				WITH RECURSIVE category_hierarchy AS (
					SELECT
						cat_id, fk_parent, cat_label, cat_wp_name,
						COALESCE(cat_wp_name, cat_label) as display_name,
						COALESCE(cat_wp_name, cat_label)::TEXT as path,
						1 as level
					FROM produit.category
					WHERE fk_parent IS NULL

					UNION ALL

					SELECT
						c.cat_id, c.fk_parent, c.cat_label, c.cat_wp_name,
						COALESCE(c.cat_wp_name, c.cat_label),
						ch.path || ' > ' || COALESCE(c.cat_wp_name, c.cat_label),
						ch.level + 1
					FROM produit.category c
					INNER JOIN category_hierarchy ch ON c.fk_parent = ch.cat_id
					WHERE ch.level < 10
				)
				SELECT
					p.pro_id,
					'simple'::text AS type,
					p.pro_cenov_id AS sku,
					NULL::varchar AS name,
					false AS published,
					false AS featured,
					'visible'::text AS visibility,
					NULL::text AS short_description,
					NULL::text AS description,
					true AS in_stock,
					pp.pp_amount::TEXT AS regular_price,
					STRING_AGG(DISTINCT ch.path, ', ' ORDER BY ch.path) AS categories,
					d.doc_link_source AS images,
					s.sup_label AS brand
				FROM produit.product p
				LEFT JOIN LATERAL (
					SELECT pp_amount FROM produit.price_purchase
					WHERE fk_product = p.pro_id ORDER BY pp_date DESC LIMIT 1
				) pp ON true
				LEFT JOIN LATERAL (
					SELECT doc_link_source FROM public.document
					WHERE product_id = p.pro_id AND is_active = true
					ORDER BY created_at DESC LIMIT 1
				) d ON true
				LEFT JOIN public.supplier s ON p.fk_supplier = s.sup_id
				LEFT JOIN produit.product_category pc ON p.pro_id = pc.fk_product
				LEFT JOIN category_hierarchy ch ON pc.fk_category = ch.cat_id
				WHERE p.pro_cenov_id IS NOT NULL
				GROUP BY p.pro_id, p.pro_cenov_id, pp.pp_amount, d.doc_link_source, s.sup_label
				ORDER BY p.pro_id ASC
			`;

	const allProductIds = products.map((p) => p.pro_id);
	const attributesMap = await getProductAttributes(database, allProductIds);

	logger.info({ count: products.length }, 'Export WordPress résultat complet');

	return products.map((p) => ({
		...p,
		attributes: attributesMap.get(p.pro_id) || []
	}));
}

/**
 * Compte le nombre total de produits avec UGS (champ commun à toutes les bases)
 * @param database - Base de données cible
 * @returns Nombre total de produits
 */
export async function getProductCount(database: DatabaseType): Promise<number> {
	const prisma = (await getClient(database)) as unknown as CenovDevPrismaClient;

	const count = await prisma.product.count({
		where: {
			pro_cenov_id: { not: null }
		}
	});

	return count;
}

/**
 * Récupère les statistiques d'export pour affichage dans l'interface
 * NOTE: Utilise des champs spécifiques à cenov_dev (is_published, in_stock)
 * Pour cenov_preprod, ces stats seront à 0
 * @param database - Base de données cible (cenov_dev ou cenov_preprod)
 * @returns Statistiques : total, publiés, en stock, sans nom, sans prix
 */
export async function getExportStats(database: DatabaseType = 'cenov_dev') {
	logger.debug({ database }, 'getExportStats - Début');

	// Stats détaillées pour cenov_dev (avec champs étendus)
	if (database === 'cenov_dev') {
		const prisma = (await getClient('cenov_dev')) as unknown as CenovDevPrismaClient;

		const [total, published, in_stock, missing_name, missing_price] = await Promise.all([
			// Total
			prisma.product.count({ where: { pro_cenov_id: { not: null } } }),

			// Produits publiés
			prisma.product.count({ where: { is_published: true, pro_cenov_id: { not: null } } }),

			// Produits en stock
			prisma.product.count({ where: { in_stock: true, pro_cenov_id: { not: null } } }),

			// Produits sans nom
			prisma.product.count({ where: { pro_name: null, pro_cenov_id: { not: null } } }),

			// Produits sans prix (SQL brut car relation complexe)
			prisma.$queryRaw<[{ count: bigint }]>`
				SELECT COUNT(*)::bigint AS count
				FROM produit.product p
				WHERE p.pro_cenov_id IS NOT NULL
					AND NOT EXISTS (
						SELECT 1 FROM produit.price_purchase WHERE fk_product = p.pro_id
					)
			`.then((r) => Number(r[0].count))
		]);

		logger.info(
			{ total, published, in_stock, missing_name, missing_price },
			'getExportStats cenov_dev résultat'
		);

		return {
			total: Number(total),
			published: Number(published),
			in_stock: Number(in_stock),
			missing_name: Number(missing_name),
			missing_price
		};
	}

	// Stats pour cenov_preprod (sans champs étendus)
	const prisma = (await getClient('cenov_preprod')) as unknown as CenovPreprodPrismaClient;

	const [total, missing_price] = await Promise.all([
		// Total - méthode ORM pure
		prisma.product.count({ where: { pro_cenov_id: { not: null } } }),

		// Produits sans prix (SQL brut car relation complexe)
		prisma.$queryRaw<[{ count: bigint }]>`
			SELECT COUNT(*)::bigint AS count
			FROM produit.product p
			WHERE p.pro_cenov_id IS NOT NULL
				AND NOT EXISTS (
					SELECT 1 FROM produit.price_purchase WHERE fk_product = p.pro_id
				)
		`.then((r) => Number(r[0].count))
	]);

	logger.info({ total, missing_price }, 'getExportStats cenov_preprod résultat');

	return {
		total: Number(total),
		published: 0, // Champ n'existe pas dans preprod
		in_stock: 0, // Champ n'existe pas dans preprod
		missing_name: 0, // Champ pro_name n'existe pas dans preprod
		missing_price
	};
}

/**
 * Récupère la liste simplifiée de tous les produits pour la sélection
 * @param database - Base de données cible (cenov_dev ou cenov_preprod)
 * @param filters - Filtres optionnels (marque, catégorie)
 * @returns Liste des produits avec ID, UGS et nom uniquement
 */
export async function getAllProductsSummary(
	database: DatabaseType = 'cenov_dev',
	filters?: {
		supplierId?: number;
		categoryId?: number;
	}
): Promise<ProductSummary[]> {
	logger.debug({ database, filters }, 'getAllProductsSummary - Début');

	// Cenov_dev: utiliser méthodes ORM avec pro_name
	if (database === 'cenov_dev') {
		const prisma = (await getClient('cenov_dev')) as unknown as CenovDevPrismaClient;

		// Construire le where dynamiquement
		const where = {
			pro_cenov_id: { not: null },
			...(filters?.supplierId && { fk_supplier: filters.supplierId }),
			...(filters?.categoryId && {
				product_category: {
					some: { fk_category: filters.categoryId }
				}
			})
		};

		logger.info(
			{ hasFilters: Boolean(filters?.supplierId || filters?.categoryId) },
			'getAllProductsSummary cenov_dev'
		);

		const products = await prisma.product.findMany({
			where,
			select: {
				pro_id: true,
				pro_cenov_id: true,
				pro_name: true
			},
			orderBy: { pro_id: 'asc' }
		});

		logger.info({ count: products.length }, 'getAllProductsSummary résultat');
		return products;
	}

	// Cenov_preprod: utiliser SQL brut car pro_name n'existe pas
	const prisma = (await getClient('cenov_preprod')) as unknown as CenovPreprodPrismaClient;

	logger.info(
		{ hasFilters: Boolean(filters?.supplierId || filters?.categoryId) },
		'getAllProductsSummary cenov_preprod'
	);

	// Sans filtres: requête simple
	if (!filters?.supplierId && !filters?.categoryId) {
		const products = await prisma.$queryRaw<ProductSummary[]>`
			SELECT
				p.pro_id,
				p.pro_cenov_id,
				NULL::varchar AS pro_name
			FROM produit.product p
			WHERE p.pro_cenov_id IS NOT NULL
			ORDER BY p.pro_id ASC
		`;

		logger.info({ count: products.length }, 'getAllProductsSummary résultat');
		return products;
	}

	// Avec filtres: requête SQL
	const products = await prisma.$queryRaw<ProductSummary[]>`
		SELECT DISTINCT
			p.pro_id,
			p.pro_cenov_id,
			NULL::varchar AS pro_name
		FROM produit.product p
		LEFT JOIN produit.product_category pc ON p.pro_id = pc.fk_product
		WHERE p.pro_cenov_id IS NOT NULL
			AND (${filters.supplierId}::int IS NULL OR p.fk_supplier = ${filters.supplierId})
			AND (${filters.categoryId}::int IS NULL OR pc.fk_category = ${filters.categoryId})
		ORDER BY p.pro_id ASC
	`;

	logger.info({ count: products.length }, 'getAllProductsSummary résultat avec filtres');
	return products;
}

/**
 * Récupère la liste des marques/fournisseurs ayant des produits
 * @param database - Base de données cible (cenov_dev ou cenov_preprod)
 */
export async function getSuppliersList(
	database: DatabaseType = 'cenov_dev'
): Promise<{ sup_id: number; sup_label: string }[]> {
	logger.debug({ database }, 'getSuppliersList - Début');

	const prisma = (await getClient(database)) as unknown as CenovDevPrismaClient;

	const suppliers = await prisma.supplier.findMany({
		where: {
			product: {
				some: {
					pro_cenov_id: { not: null }
				}
			}
		},
		select: {
			sup_id: true,
			sup_label: true
		},
		orderBy: {
			sup_label: 'asc'
		}
	});

	logger.info({ count: suppliers.length }, 'getSuppliersList résultat');
	return suppliers;
}

/**
 * Récupère la liste des catégories ayant des produits
 * @param database - Base de données cible (cenov_dev ou cenov_preprod)
 */
export async function getCategoriesList(
	database: DatabaseType = 'cenov_dev'
): Promise<{ cat_id: number; cat_label: string }[]> {
	logger.debug({ database }, 'getCategoriesList - Début');

	const prisma = (await getClient(database)) as unknown as CenovDevPrismaClient;

	const categories = await prisma.category.findMany({
		where: {
			product_category: {
				some: {
					product: {
						pro_cenov_id: { not: null }
					}
				}
			}
		},
		select: {
			cat_id: true,
			cat_label: true
		},
		orderBy: {
			cat_label: 'asc'
		}
	});

	logger.info({ count: categories.length }, 'getCategoriesList résultat');
	return categories;
}
