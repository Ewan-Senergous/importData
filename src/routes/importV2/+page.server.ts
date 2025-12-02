import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	parseCSVContent,
	validateCSVData,
	validateAttributes,
	validateRequiredAttributes,
	type ParsedCSVData,
	type ValidationResult,
	type ValidationError
} from './services/import.validation';
import { importToDatabase } from './services/import.orchestrator';
import { getClient } from '$lib/prisma-meta';
import type { PrismaClient as CenovDevPrismaClient } from '../../generated/prisma-cenov-dev/client';

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
	requiredFields: [
		'pro_cenov_id',
		'pro_code',
		'sup_code',
		'sup_label',
		'cat_code',
		'cat_label',
		'kit_label',
		'pp_amount',
		'pp_date'
	],

	fieldMapping: {
		pro_cenov_id: { table: 'product', field: 'pro_cenov_id' },
		pro_code: { table: 'product', field: 'pro_code' },
		sup_code: { table: 'supplier', field: 'sup_code' },
		sup_label: { table: 'supplier', field: 'sup_label' },
		cat_code: { table: 'category', field: 'cat_code' },
		cat_label: { table: 'category', field: 'cat_label' },
		kit_label: { table: 'kit', field: 'kit_label' },
		famille: { table: 'family', field: 'fam_label' },
		sous_famille: { table: 'family', field: 'fam_label' },
		sous_sous_famille: { table: 'family', field: 'fam_label' },
		pp_amount: { table: 'price_purchase', field: 'pp_amount' },
		pp_discount: { table: 'price_purchase', field: 'pp_discount' },
		pp_date: { table: 'price_purchase', field: 'pp_date' }
	},

	fieldMaxLengths: {
		'product.pro_cenov_id': 50,
		'product.pro_code': 50,
		'supplier.sup_code': 50,
		'supplier.sup_label': 70,
		'category.cat_code': 60,
		'category.cat_label': 100,
		'kit.kit_label': 100,
		'family.fam_label': 100
	},

	numericFields: ['pp_amount', 'pp_discount'],
	dateFields: ['pp_date']
};

// ============================================================================
// HELPERS
// ============================================================================
function formatError(err: unknown): string {
	return err instanceof Error ? err.message : 'Erreur inconnue';
}

function validateFormData(formData: FormData): { csvContent: string; error?: string } {
	const csvContent = formData.get('csv');

	if (!csvContent || typeof csvContent !== 'string') {
		return { csvContent: '', error: 'Fichier CSV manquant' };
	}

	if (csvContent.trim() === '') {
		return { csvContent: '', error: 'Fichier CSV vide' };
	}

	return { csvContent };
}

// ============================================================================
// ACTIONS
// ============================================================================
export const actions: Actions = {
	validate: async ({ request, locals }) => {
		try {
			const formData = await request.formData();
			const { csvContent, error } = validateFormData(formData);
			if (error) return fail(400, { error });

			const database = (formData.get('database') as 'cenov_dev' | 'cenov_preprod') || 'cenov_dev';

			// ✅ Validation : seule cenov_dev accessible si non connecté
			const isAuthenticated = !!locals.user;
			if (!isAuthenticated && database !== 'cenov_dev') {
				return fail(403, {
					error: 'Seule la base cenov_dev est accessible sans connexion.'
				});
			}

			const parsedData: ParsedCSVData = await parseCSVContent(csvContent, database);
			if (!parsedData.success) return fail(400, { error: parsedData.error });

			// Validation CSV (toutes les lignes)
			const csvValidation = await validateCSVData(parsedData.data, CONFIG);

			// Validation attributs PAR produit
			const allAttributeErrors: ValidationError[] = [];
			const allAttributeWarnings: ValidationError[] = [];

			for (const productAttrs of parsedData.attributes) {
				const attrValidation = await validateAttributes(productAttrs.attributes, database);

				// Préfixer erreurs avec pro_cenov_id
				for (const err of attrValidation.errors) {
					allAttributeErrors.push({
						...err,
						field: `[${productAttrs.pro_cenov_id}] ${err.field}`
					});
				}

				for (const warn of attrValidation.warnings) {
					allAttributeWarnings.push({
						...warn,
						field: `[${productAttrs.pro_cenov_id}] ${warn.field}`
					});
				}
			}

			// ✅ VALIDATION ATTRIBUTS OBLIGATOIRES - PRIORITÉ 2
			const requiredAttrsValidation = await validateRequiredAttributes(
				parsedData.data,
				parsedData.attributes,
				database
			);

			const validation: ValidationResult = {
				success:
					csvValidation.success &&
					allAttributeErrors.length === 0 &&
					requiredAttrsValidation.success,
				totalRows: parsedData.data.length,
				validRows: Math.min(
					csvValidation.validRows,
					requiredAttrsValidation.validRows,
					parsedData.data.length - allAttributeErrors.length
				),
				errors: [...csvValidation.errors, ...allAttributeErrors, ...requiredAttrsValidation.errors],
				warnings: [
					...csvValidation.warnings,
					...allAttributeWarnings,
					...requiredAttrsValidation.warnings
				]
			};

			console.log(
				`✅ Validation: ${csvValidation.validRows}/${parsedData.data.length} produit(s) valide(s)`
			);
			return { validation };
		} catch (err) {
			console.error('❌ Erreur validation:', err);
			return fail(500, { error: `Erreur de validation: ${formatError(err)}` });
		}
	},

	process: async ({ request, locals }) => {
		try {
			const formData = await request.formData();

			const { csvContent, error } = validateFormData(formData);
			if (error) {
				return fail(400, { error });
			}

			const database = (formData.get('database') as 'cenov_dev' | 'cenov_preprod') || 'cenov_dev';

			// ✅ Validation : seule cenov_dev accessible si non connecté
			const isAuthenticated = !!locals.user;
			if (!isAuthenticated && database !== 'cenov_dev') {
				return fail(403, {
					error: 'Seule la base cenov_dev est accessible sans connexion.'
				});
			}

			const parsedData = await parseCSVContent(csvContent, database);
			if (!parsedData.success) {
				return fail(400, { error: parsedData.error });
			}

			// Validation CSV
			const csvValidation = await validateCSVData(parsedData.data, CONFIG);

			// Validation attributs PAR produit
			let hasAttributeErrors = false;
			for (const productAttrs of parsedData.attributes) {
				const attrValidation = await validateAttributes(productAttrs.attributes, database);
				if (!attrValidation.success) {
					hasAttributeErrors = true;
					break;
				}
			}

			// ✅ Validation attributs obligatoires
			const requiredAttrsValidation = await validateRequiredAttributes(
				parsedData.data,
				parsedData.attributes,
				database
			);

			if (!csvValidation.success || hasAttributeErrors || !requiredAttrsValidation.success) {
				return fail(400, { error: 'Validation échouée. Veuillez corriger les erreurs.' });
			}

			const importResult = await importToDatabase(parsedData.data, parsedData.attributes, database);

			if (!importResult.success) {
				return fail(500, { error: `Erreur d'import: ${importResult.error}` });
			}

			console.log(`✅ Import réussi: ${parsedData.data.length} produit(s) importé(s)`);
			return { success: true, result: importResult };
		} catch (err) {
			return fail(500, { error: `Erreur d'importation: ${formatError(err)}` });
		}
	}
};

// ============================================================================
// LOAD
// ============================================================================

/**
 * ✅ VERSION OPTIMISÉE - Charge les catégories avec comptage d'attributs (DIRECTS + HÉRITÉS)
 * Utilise le batching pour éviter les problèmes de pool de connexions (2 requêtes au lieu de N×M)
 */
async function loadCategoriesForDatabase(database: 'cenov_dev' | 'cenov_preprod'): Promise<
	Array<{
		cat_id: number;
		cat_code: string | null;
		cat_label: string;
		attributeCount: number;
	}>
> {
	const prisma = (await getClient(database)) as unknown as CenovDevPrismaClient;

	// ✅ REQUÊTE 1 : Charger TOUTES les catégories avec fk_parent
	const allCategories = await prisma.category.findMany({
		select: {
			cat_id: true,
			cat_code: true,
			cat_label: true,
			fk_parent: true // ← IMPORTANT : pour remonter la hiérarchie
		}
	});

	// ✅ REQUÊTE 2 : Charger TOUS les category_attributes
	const allCategoryAttributes = await prisma.category_attribute.findMany({
		select: {
			fk_category: true,
			fk_attribute: true
		}
	});

	// 📊 Construire map : catId → parentId (pour remonter hiérarchie en mémoire)
	const parentMap = new Map<number, number | null>();
	for (const cat of allCategories) {
		parentMap.set(cat.cat_id, cat.fk_parent);
	}

	// 📊 Construire map : catId → Set<attributeIds> (attributs directs)
	const attributesMap = new Map<number, Set<number>>();
	for (const ca of allCategoryAttributes) {
		if (!attributesMap.has(ca.fk_category)) {
			attributesMap.set(ca.fk_category, new Set());
		}
		attributesMap.get(ca.fk_category)!.add(ca.fk_attribute);
	}

	// 🔄 Calculer comptage pour chaque catégorie EN MÉMOIRE (0 requêtes SQL)
	const categories = allCategories.map((cat) => {
		// Remonter hiérarchie EN MÉMOIRE (pas de requêtes SQL !)
		const hierarchy: number[] = [];
		let currentCatId: number | null = cat.cat_id;

		while (currentCatId !== null) {
			hierarchy.push(currentCatId);
			currentCatId = parentMap.get(currentCatId) ?? null;
		}

		// Collecter tous les attributs uniques de la hiérarchie
		const uniqueAttributes = new Set<number>();
		for (const catId of hierarchy) {
			const attrs = attributesMap.get(catId);
			if (attrs) {
				for (const attrId of attrs) {
					uniqueAttributes.add(attrId);
				}
			}
		}

		return {
			cat_id: cat.cat_id,
			cat_code: cat.cat_code,
			cat_label: cat.cat_label,
			attributeCount: uniqueAttributes.size // ✅ TOTAL (directs + hérités)
		};
	});

	// Tri alphabétique case-insensitive
	return categories.toSorted((a, b) =>
		(a.cat_label || '').localeCompare(b.cat_label || '', 'fr', { sensitivity: 'base' })
	);
}

export const load: PageServerLoad = async (event) => {
	const { locals } = event;
	const isAuthenticated = !!locals.user;

	// ✅ Charger les catégories selon l'authentification
	const categories: Partial<
		Record<
			'cenov_dev' | 'cenov_preprod',
			Array<{
				cat_id: number;
				cat_code: string | null;
				cat_label: string;
				attributeCount: number;
			}>
		>
	> = {
		cenov_dev: await loadCategoriesForDatabase('cenov_dev')
	};

	// Charger cenov_preprod seulement si authentifié
	if (isAuthenticated) {
		categories.cenov_preprod = await loadCategoriesForDatabase('cenov_preprod');
	}

	const allowedDatabases: Array<'cenov_dev' | 'cenov_preprod'> = isAuthenticated
		? ['cenov_dev', 'cenov_preprod']
		: ['cenov_dev'];

	return {
		config: CONFIG,
		categories,
		isAuthenticated,
		allowedDatabases
	};
};
