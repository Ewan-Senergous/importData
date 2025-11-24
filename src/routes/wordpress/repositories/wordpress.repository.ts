import { getClient } from '$lib/prisma-meta';
import type { PrismaClient as CenovDevPrismaClient } from '../../../../prisma/cenov_dev/generated';

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
	productIds: number[]
): Promise<Map<number, WordPressAttribute[]>> {
	if (productIds.length === 0) return new Map();

	const prisma = (await getClient('cenov_dev')) as unknown as CenovDevPrismaClient;

	// Charger produits avec leurs kits et attributs
	const products = await prisma.product.findMany({
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
					visible: ka.kat_visible ?? true,
					global: ka.kat_global ?? true
				});
			}
		}

		attributesMap.set(product.pro_id, attributes);
	}

	return attributesMap;
}

/**
 * Récupère tous les produits formatés pour l'export WordPress/WooCommerce
 * @param productIds - Liste optionnelle d'IDs de produits à exporter (si vide, exporte tous)
 * @returns Liste des produits avec tous les champs requis par WordPress
 */
export async function getProductsForWordPress(productIds?: number[]): Promise<WordPressProduct[]> {
	const prisma = (await getClient('cenov_dev')) as unknown as CenovDevPrismaClient;

	// Si des IDs sont fournis, filtrer les produits
	if (productIds && productIds.length > 0) {
		const products = await prisma.$queryRaw<Array<WordPressProduct & { pro_id: number }>>`
      WITH RECURSIVE category_hierarchy AS (
        -- Catégories racines
        SELECT
          cat_id,
          fk_parent,
          cat_label,
          cat_wp_name,
          COALESCE(cat_wp_name, cat_label) as display_name,
          COALESCE(cat_wp_name, cat_label)::TEXT as path,
          1 as level
        FROM produit.category
        WHERE fk_parent IS NULL

        UNION ALL

        -- Sous-catégories (récursion)
        SELECT
          c.cat_id,
          c.fk_parent,
          c.cat_label,
          c.cat_wp_name,
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

      -- Dernier prix d'achat
      LEFT JOIN LATERAL (
        SELECT pp_amount
        FROM produit.price_purchase
        WHERE fk_product = p.pro_id
        ORDER BY pp_date DESC
        LIMIT 1
      ) pp ON true

      -- Première image active
      LEFT JOIN LATERAL (
        SELECT doc_link_source
        FROM public.document
        WHERE product_id = p.pro_id AND is_active = true
        ORDER BY created_at DESC
        LIMIT 1
      ) d ON true

      -- Fournisseur (brand)
      LEFT JOIN public.supplier s ON p.fk_supplier = s.sup_id

      -- Catégories hiérarchiques
      LEFT JOIN produit.product_category pc ON p.pro_id = pc.fk_product
      LEFT JOIN category_hierarchy ch ON pc.fk_category = ch.cat_id

      WHERE p.pro_cenov_id IS NOT NULL
        AND p.pro_id = ANY(${productIds}::int[])

      GROUP BY p.pro_id, p.pro_type, p.pro_cenov_id, p.pro_name, p.is_published,
               p.is_featured, p.pro_visibility, p.pro_short_description, p.pro_description,
               p.in_stock, pp.pp_amount, d.doc_link_source, s.sup_label

      ORDER BY p.pro_id ASC;
    `;

		// Charger attributs
		const attributesMap = await getProductAttributes(productIds);

		// Enrichir produits avec attributs
		return products.map((p) => ({
			...p,
			attributes: attributesMap.get(p.pro_id) || []
		}));
	}

	// Sinon, retourner tous les produits
	const products = await prisma.$queryRaw<Array<WordPressProduct & { pro_id: number }>>`
    WITH RECURSIVE category_hierarchy AS (
      -- Catégories racines
      SELECT
        cat_id,
        fk_parent,
        cat_label,
        cat_wp_name,
        COALESCE(cat_wp_name, cat_label) as display_name,
        COALESCE(cat_wp_name, cat_label)::TEXT as path,
        1 as level
      FROM produit.category
      WHERE fk_parent IS NULL

      UNION ALL

      -- Sous-catégories (récursion)
      SELECT
        c.cat_id,
        c.fk_parent,
        c.cat_label,
        c.cat_wp_name,
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

    -- Dernier prix d'achat
    LEFT JOIN LATERAL (
      SELECT pp_amount
      FROM produit.price_purchase
      WHERE fk_product = p.pro_id
      ORDER BY pp_date DESC
      LIMIT 1
    ) pp ON true

    -- Première image active
    LEFT JOIN LATERAL (
      SELECT doc_link_source
      FROM public.document
      WHERE product_id = p.pro_id AND is_active = true
      ORDER BY created_at DESC
      LIMIT 1
    ) d ON true

    -- Fournisseur (brand)
    LEFT JOIN public.supplier s ON p.fk_supplier = s.sup_id

    -- Catégories hiérarchiques
    LEFT JOIN produit.product_category pc ON p.pro_id = pc.fk_product
    LEFT JOIN category_hierarchy ch ON pc.fk_category = ch.cat_id

    WHERE p.pro_cenov_id IS NOT NULL

    GROUP BY p.pro_id, p.pro_type, p.pro_cenov_id, p.pro_name, p.is_published,
             p.is_featured, p.pro_visibility, p.pro_short_description, p.pro_description,
             p.in_stock, pp.pp_amount, d.doc_link_source, s.sup_label

    ORDER BY p.pro_id ASC;
  `;

	// Charger attributs pour tous les produits
	const allProductIds = products.map((p) => p.pro_id);
	const attributesMap = await getProductAttributes(allProductIds);

	// Enrichir produits avec attributs
	return products.map((p) => ({
		...p,
		attributes: attributesMap.get(p.pro_id) || []
	}));
}

/**
 * Récupère les statistiques d'export pour affichage dans l'interface
 * @returns Statistiques : total, publiés, en stock, sans nom, sans prix
 */
export async function getExportStats() {
	const prisma = (await getClient('cenov_dev')) as unknown as CenovDevPrismaClient;

	const [total, published, in_stock, missing_name, missing_price] = await Promise.all([
		// Total produits avec UGS
		prisma.product.count({ where: { pro_cenov_id: { not: null } } }),

		// Produits publiés
		prisma.product.count({ where: { is_published: true, pro_cenov_id: { not: null } } }),

		// Produits en stock
		prisma.product.count({ where: { in_stock: true, pro_cenov_id: { not: null } } }),

		// Produits sans nom (fallback sur UGS)
		prisma.product.count({ where: { pro_name: null, pro_cenov_id: { not: null } } }),

		// Produits sans prix
		prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count
      FROM produit.product p
      WHERE p.pro_cenov_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM produit.price_purchase WHERE fk_product = p.pro_id
        )
    `.then((r) => Number(r[0].count))
	]);

	return {
		total: Number(total),
		published: Number(published),
		in_stock: Number(in_stock),
		missing_name: Number(missing_name),
		missing_price: Number(missing_price)
	};
}

/**
 * Récupère la liste simplifiée de tous les produits pour la sélection
 * @returns Liste des produits avec ID, UGS et nom uniquement
 */
export async function getAllProductsSummary(): Promise<ProductSummary[]> {
	const prisma = (await getClient('cenov_dev')) as unknown as CenovDevPrismaClient;

	return await prisma.product.findMany({
		where: { pro_cenov_id: { not: null } },
		select: {
			pro_id: true,
			pro_cenov_id: true,
			pro_name: true
		},
		orderBy: { pro_id: 'asc' }
	});
}
