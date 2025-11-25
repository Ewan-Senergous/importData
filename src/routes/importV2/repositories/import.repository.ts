import { getClient } from '$lib/prisma-meta';
import type { PrismaClient as CenovDevPrismaClient } from '../../../generated/prisma-cenov-dev/client';

// ============================================================================
// TYPES
// ============================================================================
export interface AttributeMetadata {
	attributeMap: Map<string, { atr_id: number; atr_value: string }>;
	attributeUnitsMap: Map<
		number,
		{
			default_unit_id: number | null;
			units: Array<{ unit_id: number; unit_value: string; unit_label: string }>;
		}
	>;
	allowedValuesMap: Map<number, Set<string>>;
	categoryAttributesMap: Map<string, boolean>; // key: "cat_id:atr_id" → exists
	kitAttributesMap: Map<
		string,
		{ kat_id: number; kat_value: string | null; fk_attribute_unite: number | null }
	>; // key: "kit_id:atr_id"
}

// ============================================================================
// CHARGEMENT RÉFÉRENTIELS
// ============================================================================

/**
 * Charge tous les codes attributs depuis la BDD
 * @returns Map atr_value → { atr_id, atr_value }
 */
export async function loadAttributeReference(
	database: 'cenov_dev' | 'cenov_preprod' = 'cenov_dev'
): Promise<Map<string, { atr_id: number; atr_value: string }>> {
	const prisma = (await getClient(database)) as unknown as CenovDevPrismaClient;
	const attributes = await prisma.attribute.findMany({
		select: { atr_id: true, atr_value: true },
		where: { atr_value: { not: null } }
	});
	const map = new Map();
	for (const attr of attributes) {
		map.set(attr.atr_value!, attr);
	}
	return map;
}

/**
 * Charge toutes les unités disponibles par attribut
 * @returns Map atr_id → { default_unit_id, units[] }
 */
export async function loadAttributeUnitsEnriched(
	database: 'cenov_dev' | 'cenov_preprod' = 'cenov_dev'
): Promise<
	Map<
		number,
		{
			default_unit_id: number | null;
			units: Array<{ unit_id: number; unit_value: string; unit_label: string }>;
		}
	>
> {
	const prisma = (await getClient(database)) as unknown as CenovDevPrismaClient;
	const attributeUnits = await prisma.attribute_unit.findMany({
		include: {
			attribute_attribute_unit_fk_unitToattribute: {
				select: { atr_id: true, atr_value: true, atr_label: true }
			}
		},
		orderBy: [{ fk_attribute: 'asc' }, { is_default: 'desc' }]
	});

	const map = new Map();
	for (const au of attributeUnits) {
		const atr_id = au.fk_attribute;
		const unit = au.attribute_attribute_unit_fk_unitToattribute;

		if (!map.has(atr_id)) {
			map.set(atr_id, { default_unit_id: null, units: [] });
		}

		const entry = map.get(atr_id)!;
		if (au.is_default && entry.default_unit_id === null) {
			entry.default_unit_id = au.fk_unit;
		}

		entry.units.push({
			unit_id: au.fk_unit,
			unit_value: unit.atr_value || '',
			unit_label: unit.atr_label
		});
	}
	return map;
}

/**
 * Charge les valeurs autorisées pour des attributs (listes fermées)
 * @param atrIds - IDs des attributs à charger
 * @returns Map atr_id → Set<valeurs_autorisées>
 */
export async function loadAllowedValues(
	atrIds: number[],
	database: 'cenov_dev' | 'cenov_preprod' = 'cenov_dev'
): Promise<Map<number, Set<string>>> {
	if (atrIds.length === 0) return new Map();

	const prisma = (await getClient(database)) as unknown as CenovDevPrismaClient;
	const attributeValues = await prisma.attribute_value.findMany({
		where: { av_atr_id: { in: atrIds } },
		select: { av_atr_id: true, av_value_label: true }
	});

	const allowedValuesMap = new Map();
	for (const av of attributeValues) {
		if (!allowedValuesMap.has(av.av_atr_id)) {
			allowedValuesMap.set(av.av_atr_id, new Set());
		}
		if (av.av_value_label) {
			allowedValuesMap.get(av.av_atr_id)!.add(av.av_value_label);
		}
	}
	return allowedValuesMap;
}

// ============================================================================
// CATÉGORIES
// ============================================================================

/**
 * Récupère TOUS les attributs obligatoires d'une catégorie (directs + hérités)
 * Remonte récursivement la hiérarchie via fk_parent
 */
export async function getCategoryRequiredAttributesWithInheritance(
	catId: number,
	database: 'cenov_dev' | 'cenov_preprod' = 'cenov_dev'
): Promise<
	Array<{
		atr_id: number;
		atr_value: string;
		atr_label: string;
		inherited: boolean;
		fromCatId: number;
		fromCatLabel: string;
	}>
> {
	const prisma = (await getClient(database)) as unknown as CenovDevPrismaClient;

	// 1. Remonter hiérarchie complète via fk_parent
	const hierarchy: Array<{ cat_id: number; cat_label: string }> = [];
	let currentCatId: number | null = catId;

	while (currentCatId !== null) {
		const category: { cat_id: number; cat_label: string; fk_parent: number | null } | null =
			await prisma.category.findUnique({
				where: { cat_id: currentCatId },
				select: { cat_id: true, cat_label: true, fk_parent: true }
			});

		if (!category) break;

		hierarchy.push({ cat_id: category.cat_id, cat_label: category.cat_label });
		currentCatId = category.fk_parent;
	}

	// 2. Charger TOUS les attributs obligatoires de la hiérarchie
	const categoryIds = hierarchy.map((h) => h.cat_id);

	const requiredAttrs = await prisma.category_attribute.findMany({
		where: {
			fk_category: { in: categoryIds },
			cat_atr_required: true // ← Attributs OBLIGATOIRES uniquement
		},
		include: {
			attribute: {
				select: { atr_id: true, atr_value: true, atr_label: true }
			},
			category: {
				select: { cat_label: true }
			}
		}
	});

	// 3. Dédupliquer et marquer l'origine
	const seen = new Set<number>();
	const result: Array<{
		atr_id: number;
		atr_value: string;
		atr_label: string;
		inherited: boolean;
		fromCatId: number;
		fromCatLabel: string;
	}> = [];

	for (const attr of requiredAttrs) {
		if (!seen.has(attr.attribute.atr_id)) {
			seen.add(attr.attribute.atr_id);
			result.push({
				atr_id: attr.attribute.atr_id,
				atr_value: attr.attribute.atr_value!,
				atr_label: attr.attribute.atr_label,
				inherited: attr.fk_category !== catId,
				fromCatId: attr.fk_category,
				fromCatLabel: attr.category.cat_label
			});
		}
	}

	return result;
}

/**
 * Charge les métadonnées des catégories et détecte les doublons
 * ✅ AMÉLIORATION : Recherche dans toute la hiérarchie (pas seulement racines)
 */
export async function loadCategoriesMetadata(
	catCodes: string[],
	database: 'cenov_dev' | 'cenov_preprod' = 'cenov_dev'
): Promise<{
	categoriesMap: Map<string, { cat_id: number; cat_label: string }>;
	duplicates: Array<{ cat_code: string; labels: string[] }>;
}> {
	const prisma = (await getClient(database)) as unknown as CenovDevPrismaClient;

	// ✅ MODIFICATION : Recherche dans toute la hiérarchie
	const categories = await prisma.category.findMany({
		where: {
			cat_code: { in: catCodes }
			// fk_parent retiré : accepte racines ET sous-catégories
		},
		select: { cat_id: true, cat_code: true, cat_label: true, fk_parent: true }
	});

	const categoriesMap = new Map<string, { cat_id: number; cat_label: string }>();
	const duplicates: Array<{ cat_code: string; labels: string[] }> = [];

	// Grouper par cat_code pour détecter doublons
	const grouped = new Map<string, Array<{ cat_id: number; cat_label: string }>>();
	for (const cat of categories) {
		if (!grouped.has(cat.cat_code!)) {
			grouped.set(cat.cat_code!, []);
		}
		grouped.get(cat.cat_code!)!.push({ cat_id: cat.cat_id, cat_label: cat.cat_label });
	}

	// Détecter doublons et remplir la map
	for (const [code, cats] of grouped.entries()) {
		if (cats.length > 1) {
			// Doublon détecté
			duplicates.push({
				cat_code: code,
				labels: cats.map((c) => c.cat_label)
			});
		} else {
			// Une seule catégorie
			categoriesMap.set(code, cats[0]);
		}
	}

	return { categoriesMap, duplicates };
}

/**
 * Calcule le nombre TOTAL d'attributs (directs + hérités) pour une catégorie
 * Remonte récursivement la hiérarchie via fk_parent
 */
export async function getCategoryTotalAttributeCount(
	catId: number,
	database: 'cenov_dev' | 'cenov_preprod' = 'cenov_dev'
): Promise<number> {
	const prisma = (await getClient(database)) as unknown as CenovDevPrismaClient;

	// 1. Remonter hiérarchie complète via fk_parent
	const hierarchy: number[] = [];
	let currentCatId: number | null = catId;

	while (currentCatId !== null) {
		hierarchy.push(currentCatId);
		const category: { fk_parent: number | null } | null = await prisma.category.findUnique({
			where: { cat_id: currentCatId },
			select: { fk_parent: true }
		});
		currentCatId = category?.fk_parent ?? null;
	}

	// 2. Charger TOUS les attributs de la hiérarchie (directs + hérités)
	const allAttributes = await prisma.category_attribute.findMany({
		where: { fk_category: { in: hierarchy } },
		select: { fk_attribute: true }
	});

	// 3. Compter les attributs uniques (dédupliquer si même attribut dans parent et enfant)
	const uniqueAttributes = new Set(allAttributes.map((a) => a.fk_attribute));

	return uniqueAttributes.size;
}
