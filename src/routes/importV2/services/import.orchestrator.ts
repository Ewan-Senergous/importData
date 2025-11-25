import { getClient } from '$lib/prisma-meta';
import type { PrismaClient as CenovDevPrismaClient } from '../../../generated/prisma-cenov-dev/client';
import {
	loadAttributeReference,
	loadAttributeUnitsEnriched,
	loadAllowedValues,
	type AttributeMetadata
} from '../repositories/import.repository';
import {
	parseValueAndUnit,
	findUnitId,
	type CSVRow,
	type ProductAttributes,
	type AttributePair
} from './import.validation';

// ============================================================================
// TYPES
// ============================================================================
type PrismaTransaction = Omit<
	CenovDevPrismaClient,
	'$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export interface ImportStats {
	suppliers: number;
	kits: number;
	categories: number;
	families: number;
	products: number;
	productsUpdated: number;
	prices: number;
	categoryAttributes: number;
	kitAttributes: number;
}

export type ChangeValue = string | number | null;

export interface ChangeDetail {
	table: string;
	schema: string;
	column: string;
	oldValue: ChangeValue;
	newValue: ChangeValue;
	recordId: string;
}

export interface ImportResult {
	success: boolean;
	stats: ImportStats;
	changes: ChangeDetail[];
	error?: string;
}

// ============================================================================
// IMPORT BDD
// ============================================================================
export async function importToDatabase(
	data: CSVRow[],
	attributesByProduct: ProductAttributes[],
	database: 'cenov_dev' | 'cenov_preprod' = 'cenov_dev'
): Promise<ImportResult> {
	const stats: ImportStats = {
		suppliers: 0,
		kits: 0,
		categories: 0,
		families: 0,
		products: 0,
		productsUpdated: 0,
		prices: 0,
		categoryAttributes: 0,
		kitAttributes: 0
	};
	const changes: ChangeDetail[] = [];

	try {
		const prisma = (await getClient(database)) as unknown as CenovDevPrismaClient;

		// ✅ Charger TOUTES les métadonnées AVANT la transaction (évite timeout)
		console.log('🔄 Chargement métadonnées attributs...');
		const metadata: AttributeMetadata = {
			attributeMap: await loadAttributeReference(database),
			attributeUnitsMap: await loadAttributeUnitsEnriched(database),
			allowedValuesMap: new Map<number, Set<string>>(), // Sera rempli dynamiquement
			categoryAttributesMap: new Map<string, boolean>(),
			kitAttributesMap: new Map<
				string,
				{ kat_id: number; kat_value: string | null; fk_attribute_unite: number | null }
			>()
		};

		// Collecter tous les cat_id, kit_id et atr_id uniques du CSV
		const uniqueCatCodes = new Set<string>();
		const uniqueKitLabels = new Set<string>();
		const allAtrIds = new Set<number>();

		for (const row of data) {
			if (row.cat_code) uniqueCatCodes.add(row.cat_code);
			if (row.kit_label) uniqueKitLabels.add(row.kit_label);
		}

		for (const productAttrs of attributesByProduct) {
			for (const attr of productAttrs.attributes) {
				const atrData = metadata.attributeMap.get(attr.atrValueCode);
				if (atrData) allAtrIds.add(atrData.atr_id);
			}
		}

		// Charger valeurs autorisées pour tous les attributs
		if (allAtrIds.size > 0) {
			metadata.allowedValuesMap = await loadAllowedValues(Array.from(allAtrIds), database);
		}

		// ✅ OPTIMISATION : Précharger category_attribute et kit_attribute (évite 2000+ requêtes en boucle)
		console.log('🔄 Préchargement category_attribute et kit_attribute...');

		// Récupérer les cat_id depuis les cat_code
		// ✅ CORRECTION : Recherche dans toute la hiérarchie (cohérent avec findOrCreateCategory)
		const categories = await prisma.category.findMany({
			where: { cat_code: { in: Array.from(uniqueCatCodes) } },
			select: { cat_id: true, cat_code: true }
		});
		const catIdsByCatCode = new Map(categories.map((c) => [c.cat_code!, c.cat_id]));
		const uniqueCatIds = Array.from(catIdsByCatCode.values());

		// Récupérer les kit_id depuis les kit_label
		const kits = await prisma.kit.findMany({
			where: { kit_label: { in: Array.from(uniqueKitLabels) } },
			select: { kit_id: true, kit_label: true }
		});
		const kitIdsByKitLabel = new Map(kits.map((k) => [k.kit_label, k.kit_id]));
		const uniqueKitIds = Array.from(kitIdsByKitLabel.values());

		// Précharger TOUS les category_attribute
		const categoryAttributes = await prisma.category_attribute.findMany({
			where: { fk_category: { in: uniqueCatIds } }
		});
		for (const ca of categoryAttributes) {
			const key = `${ca.fk_category}:${ca.fk_attribute}`;
			metadata.categoryAttributesMap.set(key, true);
		}

		// Précharger TOUS les kit_attribute
		const kitAttributes = await prisma.kit_attribute.findMany({
			where: { fk_kit: { in: uniqueKitIds } }
		});
		for (const ka of kitAttributes) {
			const key = `${ka.fk_kit}:${ka.fk_attribute_characteristic}`;
			metadata.kitAttributesMap.set(key, {
				kat_id: ka.kat_id,
				kat_value: ka.kat_value,
				fk_attribute_unite: ka.fk_attribute_unite
			});
		}

		console.log(
			`✅ Métadonnées chargées: ${metadata.attributeMap.size} attributs, ${categoryAttributes.length} category_attribute, ${kitAttributes.length} kit_attribute`
		);

		// ✅ CORRECTION : Augmenter timeout transaction pour import de masse
		await prisma.$transaction(
			async (tx) => {
				for (const row of data) {
					const supplierResult = await findOrCreateSupplier(
						tx,
						row.sup_code,
						row.sup_label,
						changes
					);
					if (supplierResult.isNew) stats.suppliers++;

					const kitResult = await findOrCreateKit(tx, row.kit_label, changes);
					if (kitResult.isNew) stats.kits++;

					// cat_code et cat_label sont obligatoires (validés avant l'import)
					const categoryResult = await findOrCreateCategory(
						tx,
						row.cat_code,
						row.cat_label,
						changes
					);
					if (categoryResult.isNew) stats.categories++;

					// ✅ AUTO-LIAISON: Si nouvelle catégorie, lier les attributs du CSV (tous optionnels)
					if (categoryResult.isNew) {
						const productAttrsForCategory = attributesByProduct.find(
							(a) => a.pro_cenov_id === row.pro_cenov_id
						);
						if (productAttrsForCategory) {
							const attributeCodes = productAttrsForCategory.attributes.map((a) => a.atrValueCode);
							await autoLinkCategoryAttributes(
								tx,
								categoryResult.entity.cat_id,
								row.cat_code,
								attributeCodes,
								changes,
								metadata
							);
						}
					}

					const familyIds = await resolveFamilyHierarchy(
						tx,
						row,
						supplierResult.entity.sup_id,
						stats,
						changes
					);

					const productResult = await upsertProduct(
						tx,
						row,
						supplierResult.entity.sup_id,
						kitResult.entity.kit_id,
						familyIds,
						categoryResult,
						changes
					);
					if (productResult.isNew) stats.products++;
					else stats.productsUpdated++;

					await upsertPricePurchase(tx, productResult.entity.pro_id, row, changes);
					stats.prices++;

					// Récupérer les attributs de CE produit
					const productAttrs = attributesByProduct.find((a) => a.pro_cenov_id === row.pro_cenov_id);

					if (categoryResult && productAttrs && productAttrs.attributes.length > 0) {
						const attrStats = await importAttributes(
							tx,
							categoryResult.entity.cat_id,
							kitResult.entity.kit_id,
							row.kit_label, // ✅ Passer kit_label pour éviter requête
							productAttrs.attributes,
							changes,
							metadata // ✅ Passer les métadonnées préchargées
						);
						stats.categoryAttributes += attrStats.categoryAttributes;
						stats.kitAttributes += attrStats.kitAttributes;
					}
				}
			},
			{
				timeout: 60000, // 60 secondes (au lieu de 5s par défaut)
				maxWait: 10000 // 10 secondes d'attente max pour obtenir une connexion
			}
		);

		return { success: true, stats, changes };
	} catch (error) {
		return {
			success: false,
			stats,
			changes,
			error: error instanceof Error ? error.message : 'Erreur inconnue'
		};
	}
}

async function findOrCreateSupplier(
	tx: PrismaTransaction,
	sup_code: string,
	sup_label: string,
	changes: ChangeDetail[]
) {
	const existing = await tx.supplier.findUnique({ where: { sup_code } });
	const supplier = await tx.supplier.upsert({
		where: { sup_code },
		create: { sup_code, sup_label },
		update: { sup_label }
	});

	if (!existing) {
		changes.push(
			{
				table: 'supplier',
				schema: 'public',
				column: 'sup_code',
				oldValue: null,
				newValue: sup_code,
				recordId: sup_code
			},
			{
				table: 'supplier',
				schema: 'public',
				column: 'sup_label',
				oldValue: null,
				newValue: sup_label,
				recordId: sup_code
			}
		);
		console.log(`📦 Fournisseur créé: ${sup_label} (${sup_code})`);
	} else if (existing.sup_label !== sup_label) {
		changes.push({
			table: 'supplier',
			schema: 'public',
			column: 'sup_label',
			oldValue: existing.sup_label,
			newValue: sup_label,
			recordId: sup_code
		});
		console.log(
			`🔄 Fournisseur mis à jour: ${sup_code} - "${existing.sup_label}" → "${sup_label}"`
		);
	}

	return { entity: supplier, isNew: !existing };
}

async function findOrCreateKit(tx: PrismaTransaction, kit_label: string, changes: ChangeDetail[]) {
	const existing = await tx.kit.findUnique({ where: { kit_label } });
	const kit = await tx.kit.upsert({
		where: { kit_label },
		create: { kit_label },
		update: { kit_label }
	});

	if (!existing) {
		changes.push({
			table: 'kit',
			schema: 'public',
			column: 'kit_label',
			oldValue: null,
			newValue: kit_label,
			recordId: kit_label
		});
		console.log(`📦 Kit créé: ${kit_label}`);
	}

	return { entity: kit, isNew: !existing };
}

async function findOrCreateCategory(
	tx: PrismaTransaction,
	cat_code: string,
	cat_label: string,
	changes: ChangeDetail[]
) {
	// ✅ AMÉLIORATION : Recherche dans toute la hiérarchie (pas seulement racines)
	const categories = await tx.category.findMany({
		where: { cat_code }
	});

	// ✅ ROBUSTESSE : Vérifier unicité du cat_code
	if (categories.length > 1) {
		throw new Error(
			`Ambiguïté BDD : ${categories.length} catégories trouvées avec le code ${cat_code}. ` +
				`IDs: ${categories.map((c) => c.cat_id).join(', ')}. ` +
				`Corrigez les doublons en base avant import.`
		);
	}

	const existing = categories.length === 1 ? categories[0] : null;
	let category;

	if (existing) {
		// UPDATE - Catégorie existe (peut être racine ou sous-catégorie)
		const hierarchyInfo = existing.fk_parent ? `sous-catégorie de ${existing.fk_parent}` : 'racine';
		console.log(`✅ Catégorie trouvée: ${cat_code} - ${cat_label} (${hierarchyInfo})`);

		if (existing.cat_label === cat_label) {
			category = existing;
		} else {
			category = await tx.category.update({
				where: { cat_id: existing.cat_id },
				data: { cat_label }
			});

			changes.push({
				table: 'category',
				schema: 'produit',
				column: 'cat_label',
				oldValue: existing.cat_label,
				newValue: cat_label,
				recordId: cat_code
			});
			console.log(
				`🔄 Catégorie mise à jour: ${cat_code} - "${existing.cat_label}" → "${cat_label}"`
			);
		}
	} else {
		// CREATE - Nouvelle catégorie (racine par défaut)
		category = await tx.category.create({
			data: { fk_parent: null, cat_code, cat_label }
		});

		changes.push(
			{
				table: 'category',
				schema: 'produit',
				column: 'cat_code',
				oldValue: null,
				newValue: cat_code,
				recordId: cat_code
			},
			{
				table: 'category',
				schema: 'produit',
				column: 'cat_label',
				oldValue: null,
				newValue: cat_label,
				recordId: cat_code
			}
		);
		console.log(`📦 Catégorie créée (racine): ${cat_label} (${cat_code})`);
	}

	return { entity: category, isNew: !existing };
}

/**
 * Auto-lie les attributs du CSV à une nouvelle catégorie (tous optionnels)
 */
async function autoLinkCategoryAttributes(
	tx: PrismaTransaction,
	cat_id: number,
	cat_code: string,
	attributeCodes: string[],
	changes: ChangeDetail[],
	metadata: AttributeMetadata
): Promise<number> {
	if (attributeCodes.length === 0) return 0;

	let linkedCount = 0;

	// Récupérer les atr_id pour les codes fournis
	const attributes = await tx.attribute.findMany({
		where: { atr_value: { in: attributeCodes } },
		select: { atr_id: true, atr_value: true }
	});

	const attributeMap = new Map(attributes.map((a) => [a.atr_value!, a.atr_id]));

	for (const code of attributeCodes) {
		const atr_id = attributeMap.get(code);
		if (!atr_id) {
			console.log(`⚠️ Attribut ${code} introuvable, ignoré pour auto-liaison`);
			continue;
		}

		// ✅ Vérifier dans le cache d'abord
		const catAttrKey = `${cat_id}:${atr_id}`;
		const existingInCache = metadata.categoryAttributesMap.has(catAttrKey);

		if (!existingInCache) {
			await tx.category_attribute.create({
				data: {
					fk_category: cat_id,
					fk_attribute: atr_id,
					cat_atr_required: false // Tous optionnels par défaut
				}
			});

			// ✅ Mettre à jour le cache pour éviter duplicatas
			metadata.categoryAttributesMap.set(catAttrKey, true);

			changes.push({
				table: 'category_attribute',
				schema: 'produit',
				column: 'fk_attribute',
				oldValue: null,
				newValue: atr_id,
				recordId: `${cat_code} → ${code} (optionnel)`
			});

			linkedCount++;
		}
	}

	if (linkedCount > 0) {
		console.log(`📎 Auto-liaison: ${linkedCount} attribut(s) lié(s) à la catégorie ${cat_code}`);
	}

	return linkedCount;
}

async function resolveFamilyHierarchy(
	tx: PrismaTransaction,
	row: CSVRow,
	fk_supplier: number,
	stats: ImportStats,
	changes: ChangeDetail[]
) {
	let fam_id = null,
		sfam_id = null,
		ssfam_id = null;

	if (row.famille) {
		const famille = await findOrCreateFamily(tx, row.famille, null, fk_supplier, changes);
		if (famille.isNew) stats.families++;
		fam_id = famille.entity.fam_id;

		if (row.sous_famille) {
			const sousFamille = await findOrCreateFamily(
				tx,
				row.sous_famille,
				fam_id,
				fk_supplier,
				changes
			);
			if (sousFamille.isNew) stats.families++;
			sfam_id = sousFamille.entity.fam_id;

			if (row.sous_sous_famille) {
				const sousSousFamille = await findOrCreateFamily(
					tx,
					row.sous_sous_famille,
					sfam_id,
					fk_supplier,
					changes
				);
				if (sousSousFamille.isNew) stats.families++;
				ssfam_id = sousSousFamille.entity.fam_id;
			}
		}
	}
	return { fam_id, sfam_id, ssfam_id };
}

async function findOrCreateFamily(
	tx: PrismaTransaction,
	fam_label: string,
	fk_parent: number | null,
	fk_supplier: number,
	changes: ChangeDetail[]
) {
	const whereClause = { fam_label, fk_parent: fk_parent || null, fk_supplier };
	let family = await tx.family.findFirst({ where: whereClause });
	const isNew = !family;

	if (!family) {
		if (fk_parent === null) {
			family = await tx.family.create({
				data: { fam_label, fk_parent: null, fk_supplier, fk_category: null }
			});
		} else {
			family = await tx.family.upsert({
				where: { fam_label_fk_parent_fk_supplier: { fam_label, fk_parent, fk_supplier } },
				create: { fam_label, fk_parent, fk_supplier, fk_category: null },
				update: {}
			});
		}

		const level = fk_parent ? '(sous-famille)' : '(famille)';
		changes.push({
			table: 'family',
			schema: 'produit',
			column: 'fam_label',
			oldValue: null,
			newValue: fam_label,
			recordId: `${fam_label} ${level}`
		});

		console.log(`📦 Famille créée: ${fam_label} ${level}`);
	}

	return { entity: family, isNew };
}

async function upsertProduct(
	tx: PrismaTransaction,
	row: CSVRow,
	fk_supplier: number,
	fk_kit: number,
	familyIds: { fam_id: number | null; sfam_id: number | null; ssfam_id: number | null },
	categoryResult: { entity: { cat_id: number }; isNew: boolean } | null,
	changes: ChangeDetail[]
) {
	const existing = await tx.product.findUnique({
		where: { fk_supplier_pro_code: { fk_supplier, pro_code: row.pro_code } }
	});

	const productData = {
		pro_cenov_id: row.pro_cenov_id,
		pro_code: row.pro_code,
		sup_code: row.sup_code,
		sup_label: row.sup_label,
		cat_code: row.cat_code,
		fk_supplier,
		fk_kit,
		fk_family: familyIds.fam_id,
		fk_sfamily: familyIds.sfam_id,
		fk_ssfamily: familyIds.ssfam_id
	};

	const product = await tx.product.upsert({
		where: { fk_supplier_pro_code: { fk_supplier, pro_code: row.pro_code } },
		create: productData,
		update: productData
	});

	// Capturer les changements si produit existant
	if (existing) {
		const fieldMap = [
			{ key: 'pro_code', label: 'pro_code' },
			{ key: 'sup_code', label: 'sup_code' },
			{ key: 'sup_label', label: 'sup_label' },
			{ key: 'cat_code', label: 'cat_code' },
			{ key: 'fk_supplier', label: 'fk_supplier' },
			{ key: 'fk_kit', label: 'fk_kit' },
			{ key: 'fk_family', label: 'fk_family' },
			{ key: 'fk_sfamily', label: 'fk_sfamily' },
			{ key: 'fk_ssfamily', label: 'fk_ssfamily' },
			{ key: 'fk_document', label: 'fk_document' }
		];

		for (const { key, label } of fieldMap) {
			const oldValue = existing[key as keyof typeof existing];
			const newValue = productData[key as keyof typeof productData];

			if (oldValue !== newValue) {
				changes.push({
					table: 'product',
					schema: 'produit',
					column: label,
					oldValue: oldValue as ChangeValue,
					newValue: newValue as ChangeValue,
					recordId: row.pro_cenov_id
				});
			}
		}
		console.log(`🔄 Produit mis à jour: ${row.pro_cenov_id} (${row.pro_code})`);
	} else {
		// Tracker la création du produit avec tous ses champs
		const productChanges: ChangeDetail[] = [
			{
				table: 'product',
				schema: 'produit',
				column: 'pro_cenov_id',
				oldValue: null,
				newValue: row.pro_cenov_id,
				recordId: row.pro_cenov_id
			},
			{
				table: 'product',
				schema: 'produit',
				column: 'pro_code',
				oldValue: null,
				newValue: row.pro_code,
				recordId: row.pro_cenov_id
			},
			{
				table: 'product',
				schema: 'produit',
				column: 'sup_code',
				oldValue: null,
				newValue: row.sup_code,
				recordId: row.pro_cenov_id
			},
			{
				table: 'product',
				schema: 'produit',
				column: 'sup_label',
				oldValue: null,
				newValue: row.sup_label,
				recordId: row.pro_cenov_id
			},
			{
				table: 'product',
				schema: 'produit',
				column: 'cat_code',
				oldValue: null,
				newValue: row.cat_code,
				recordId: row.pro_cenov_id
			}
		];
		if (row.fk_document) {
			productChanges.push({
				table: 'product',
				schema: 'produit',
				column: 'fk_document',
				oldValue: null,
				newValue: Number.parseInt(row.fk_document),
				recordId: row.pro_cenov_id
			});
		}
		changes.push(...productChanges);
		console.log(`✅ Produit créé: ${row.pro_cenov_id} (${row.pro_code})`);
	}

	if (categoryResult) {
		const existingProductCategory = await tx.product_category.findUnique({
			where: {
				fk_product_fk_category: {
					fk_product: product.pro_id,
					fk_category: categoryResult.entity.cat_id
				}
			}
		});

		await tx.product_category.upsert({
			where: {
				fk_product_fk_category: {
					fk_product: product.pro_id,
					fk_category: categoryResult.entity.cat_id
				}
			},
			create: { fk_product: product.pro_id, fk_category: categoryResult.entity.cat_id },
			update: {}
		});

		if (!existingProductCategory) {
			changes.push({
				table: 'product_category',
				schema: 'produit',
				column: 'fk_category',
				oldValue: null,
				newValue: categoryResult.entity.cat_id,
				recordId: `${row.pro_cenov_id} → cat_id:${categoryResult.entity.cat_id}`
			});
		}
	}

	return { entity: product, isNew: !existing };
}

async function upsertPricePurchase(
	tx: PrismaTransaction,
	fk_product: number,
	row: CSVRow,
	changes: ChangeDetail[]
) {
	const pp_discount =
		row.pp_discount && row.pp_discount.trim() !== '' ? Number.parseFloat(row.pp_discount) : null;
	const pp_date = new Date(row.pp_date);
	const pp_amount = Number.parseFloat(row.pp_amount);

	// Vérifier si un prix existe déjà
	const existing = await tx.price_purchase.findUnique({
		where: { fk_product_pp_date: { fk_product, pp_date } }
	});

	const fk_document = row.fk_document ? Number.parseInt(row.fk_document) : null;

	await tx.price_purchase.upsert({
		where: { fk_product_pp_date: { fk_product, pp_date } },
		create: {
			fk_product,
			pp_date,
			pp_amount,
			pp_discount,
			pro_cenov_id: row.pro_cenov_id,
			fk_document
		},
		update: {
			pp_amount,
			pp_discount,
			fk_document
		}
	});

	// Capturer les changements (création ou modification)
	if (existing) {
		// Modification : comparer anciennes vs nouvelles valeurs
		if (existing.pp_amount.toNumber() !== pp_amount) {
			changes.push({
				table: 'price_purchase',
				schema: 'produit',
				column: 'pp_amount',
				oldValue: existing.pp_amount.toNumber(),
				newValue: pp_amount,
				recordId: `${row.pro_cenov_id} (${row.pp_date})`
			});
		}

		const oldDiscount = existing.pp_discount ? existing.pp_discount.toNumber() : null;
		if (oldDiscount !== pp_discount) {
			changes.push({
				table: 'price_purchase',
				schema: 'produit',
				column: 'pp_discount',
				oldValue: oldDiscount,
				newValue: pp_discount,
				recordId: `${row.pro_cenov_id} (${row.pp_date})`
			});
		}

		if (existing.fk_document !== fk_document) {
			changes.push({
				table: 'price_purchase',
				schema: 'produit',
				column: 'fk_document',
				oldValue: existing.fk_document,
				newValue: fk_document,
				recordId: `${row.pro_cenov_id} (${row.pp_date})`
			});
		}
	} else {
		// Création : tracker le nouveau prix
		changes.push({
			table: 'price_purchase',
			schema: 'produit',
			column: 'pp_amount',
			oldValue: null,
			newValue: pp_amount,
			recordId: `${row.pro_cenov_id} (${row.pp_date})`
		});
		if (pp_discount !== null) {
			changes.push({
				table: 'price_purchase',
				schema: 'produit',
				column: 'pp_discount',
				oldValue: null,
				newValue: pp_discount,
				recordId: `${row.pro_cenov_id} (${row.pp_date})`
			});
		}
		if (fk_document !== null) {
			changes.push({
				table: 'price_purchase',
				schema: 'produit',
				column: 'fk_document',
				oldValue: null,
				newValue: fk_document,
				recordId: `${row.pro_cenov_id} (${row.pp_date})`
			});
		}
	}

	const pp_net = pp_discount ? pp_amount * (1 - pp_discount / 100) : pp_amount;
	const discountStr = pp_discount ? ` (remise ${pp_discount}% = ${pp_net.toFixed(2)}€ net)` : '';
	console.log(`💰 Prix enregistré: ${pp_amount}€${discountStr} - Date: ${row.pp_date}`);
}

async function importAttributes(
	tx: PrismaTransaction,
	cat_id: number,
	kit_id: number,
	kit_label: string, // ✅ Reçu en paramètre au lieu de requête
	attributes: AttributePair[],
	changes: ChangeDetail[],
	metadata: AttributeMetadata // ✅ Métadonnées préchargées
) {
	let categoryAttributes = 0,
		kitAttributes = 0;

	// ✅ Utiliser les métadonnées préchargées (pas de requêtes BDD)
	const {
		attributeMap,
		attributeUnitsMap,
		allowedValuesMap,
		categoryAttributesMap,
		kitAttributesMap
	} = metadata;

	for (const { atrValueCode, atrValue } of attributes) {
		if (!atrValue || atrValue.trim() === '') continue;

		const attribute = attributeMap.get(atrValueCode);
		if (!attribute) continue;

		// ✅ OPTIMISATION : Vérifier existence dans map préchargée (au lieu de findFirst)
		const catAttrKey = `${cat_id}:${attribute.atr_id}`;
		const existingCatAttr = categoryAttributesMap.has(catAttrKey);

		if (!existingCatAttr) {
			await tx.category_attribute.create({
				data: { fk_category: cat_id, fk_attribute: attribute.atr_id, cat_atr_required: false }
			});
			categoryAttributes++;

			// ✅ Ajouter à la map pour éviter duplicatas dans la même transaction
			categoryAttributesMap.set(catAttrKey, true);

			changes.push({
				table: 'category_attribute',
				schema: 'produit',
				column: 'fk_attribute',
				oldValue: null,
				newValue: attribute.atr_id,
				recordId: `cat_id:${cat_id} → ${atrValueCode}`
			});
		}

		const allowedValues = allowedValuesMap.get(attribute.atr_id);
		let finalValue = atrValue;
		let finalUnitId = null;

		if (!allowedValues || allowedValues.size === 0) {
			const { value, unit } = parseValueAndUnit(atrValue);
			finalValue = value;

			if (unit) {
				finalUnitId = findUnitId(attribute.atr_id, unit, attributeUnitsMap);
			} else {
				const unitsData = attributeUnitsMap.get(attribute.atr_id);
				if (unitsData?.default_unit_id) {
					finalUnitId = unitsData.default_unit_id;
				}
			}
		}

		// ✅ OPTIMISATION : Vérifier existence dans map préchargée (au lieu de findFirst)
		const kitAttrKey = `${kit_id}:${attribute.atr_id}`;
		const existingKitAttr = kitAttributesMap.get(kitAttrKey);

		if (existingKitAttr) {
			// Capturer les changements de valeur
			if (existingKitAttr.kat_value !== finalValue) {
				changes.push({
					table: 'kit_attribute',
					schema: 'public',
					column: 'kat_value',
					oldValue: existingKitAttr.kat_value,
					newValue: finalValue,
					recordId: `${kit_label} - ${atrValueCode}`
				});
			}

			// Capturer les changements d'unité
			if (existingKitAttr.fk_attribute_unite !== finalUnitId) {
				changes.push({
					table: 'kit_attribute',
					schema: 'public',
					column: 'fk_attribute_unite',
					oldValue: existingKitAttr.fk_attribute_unite,
					newValue: finalUnitId,
					recordId: `${kit_label} - ${atrValueCode}`
				});
			}

			await tx.kit_attribute.update({
				where: { kat_id: existingKitAttr.kat_id },
				data: { kat_value: finalValue, fk_attribute_unite: finalUnitId }
			});

			// ✅ Mettre à jour la map avec les nouvelles valeurs
			kitAttributesMap.set(kitAttrKey, {
				kat_id: existingKitAttr.kat_id,
				kat_value: finalValue,
				fk_attribute_unite: finalUnitId
			});
		} else {
			const created = await tx.kit_attribute.create({
				data: {
					fk_kit: kit_id,
					fk_attribute_characteristic: attribute.atr_id,
					fk_attribute_unite: finalUnitId,
					kat_value: finalValue
				}
			});

			// ✅ Ajouter à la map pour éviter duplicatas dans la même transaction
			kitAttributesMap.set(kitAttrKey, {
				kat_id: created.kat_id,
				kat_value: finalValue,
				fk_attribute_unite: finalUnitId
			});

			// Tracker la création du kit_attribute
			changes.push({
				table: 'kit_attribute',
				schema: 'public',
				column: 'kat_value',
				oldValue: null,
				newValue: finalValue,
				recordId: `${kit_label} - ${atrValueCode}`
			});
			if (finalUnitId !== null) {
				changes.push({
					table: 'kit_attribute',
					schema: 'public',
					column: 'fk_attribute_unite',
					oldValue: null,
					newValue: finalUnitId,
					recordId: `${kit_label} - ${atrValueCode}`
				});
			}

			kitAttributes++;
		}
	}

	if (categoryAttributes > 0 || kitAttributes > 0) {
		console.log(`📊 Attributs importés: ${kitAttributes} attributs kit`);
	}

	return { categoryAttributes, kitAttributes };
}
