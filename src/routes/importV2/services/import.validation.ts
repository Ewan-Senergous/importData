import { getClient } from '$lib/prisma-meta';
import type { PrismaClient as CenovDevPrismaClient } from '../../../generated/prisma-cenov-dev/client';
import {
	loadAttributeReference,
	loadAttributeUnitsEnriched,
	loadAllowedValues,
	loadCategoriesMetadata,
	getCategoryRequiredAttributesWithInheritance
} from '../repositories/import.repository';

// ============================================================================
// TYPES
// ============================================================================
export interface CSVRow {
	pro_cenov_id: string;
	pro_code: string;
	sup_code: string;
	sup_label: string;
	cat_code: string;
	cat_label: string;
	fk_document?: string;
	kit_label: string;
	famille?: string;
	sous_famille?: string;
	sous_sous_famille?: string;
	pp_amount: string;
	pp_discount?: string;
	pp_date: string;
}

export interface AttributePair {
	atrValueCode: string; // Code atr_value de la BDD (ex: PRESSION_LIMITE)
	atrValue: string | null; // Valeur de l'attribut (ex: 0.1)
}

export interface ProductAttributes {
	pro_cenov_id: string;
	attributes: AttributePair[];
}

export interface ParsedCSVData {
	success: boolean;
	data: CSVRow[];
	attributes: ProductAttributes[]; // Attributs par produit
	error?: string;
}

export interface ValidationError {
	line: number;
	field: string;
	value: string;
	error: string;
}

export interface ValidationResult {
	success: boolean;
	totalRows: number;
	validRows: number;
	errors: ValidationError[];
	warnings: ValidationError[];
}

// ============================================================================
// UTILITAIRES
// ============================================================================
function convertToISODate(dateStr: string): string | null {
	if (!dateStr || dateStr.trim() === '') return null;
	const trimmed = dateStr.trim();

	if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

	const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
	if (match) {
		const [, day, month, year] = match;
		return `${year}-${month}-${day}`;
	}
	return null;
}

export function parseValueAndUnit(rawValue: string): { value: string; unit: string | null } {
	if (!rawValue || typeof rawValue !== 'string') {
		return { value: rawValue, unit: null };
	}

	const regex = /^(\d+(?:\.\d+)?(?:\/\d+)?)\s*(.*)$/;
	const match = regex.exec(rawValue.trim());

	if (!match) return { value: rawValue, unit: null };

	const value = match[1];
	const unit = match[2].trim() || null;
	return { value, unit };
}

export function findUnitId(
	atr_id: number,
	unit_string: string,
	attributeUnitsMap: Map<
		number,
		{
			default_unit_id: number | null;
			units: Array<{ unit_id: number; unit_value: string; unit_label: string }>;
		}
	>
): number | null {
	const unitsData = attributeUnitsMap.get(atr_id);
	if (!unitsData?.units) return null;

	const search = unit_string.toLowerCase();

	for (const unit of unitsData.units) {
		if (unit.unit_value.toLowerCase() === search || unit.unit_label.toLowerCase() === search) {
			return unit.unit_id;
		}
	}
	return null;
}

// ============================================================================
// PARSE CSV FORMAT VERTICAL (NATIF - SANS PAPAPARSE)
// ============================================================================
function parseCSVNative(csvContent: string, delimiter: string): unknown[][] {
	const lines = csvContent.split(/\r?\n/);
	const result: unknown[][] = [];

	for (const line of lines) {
		if (line.trim() === '') continue; // Skip empty lines
		const values = line.split(delimiter);
		result.push(values);
	}

	return result;
}

export async function parseCSVContent(
	csvContent: string,
	database: 'cenov_dev' | 'cenov_preprod' = 'cenov_dev'
): Promise<ParsedCSVData> {
	try {
		const rawData = parseCSVNative(csvContent, ';');

		if (rawData.length < 2) {
			return {
				success: false,
				data: [],
				attributes: [],
				error: 'Fichier CSV invalide (moins de 2 lignes)'
			};
		}

		const headers = rawData[0] as string[];

		// Charger tous les atr_value depuis BDD pour détection
		const prisma = (await getClient(database)) as unknown as CenovDevPrismaClient;
		const attributesFromDB = await prisma.attribute.findMany({
			select: { atr_value: true },
			where: { atr_value: { not: null } }
		});
		const validAtrValues = new Set(attributesFromDB.map((a) => a.atr_value));

		const allRows: CSVRow[] = [];
		const allAttributes: ProductAttributes[] = [];

		// Boucle sur TOUTES les lignes de données (à partir de la ligne 2)
		for (let lineIndex = 1; lineIndex < rawData.length; lineIndex++) {
			const values = rawData[lineIndex] as string[];

			// Skip lignes vides (tous les champs vides)
			if (values.every((v) => !v || v.trim() === '')) {
				console.log(`⚠️ Ligne ${lineIndex + 1} vide ignorée`);
				continue;
			}

			const row: Record<string, string> = {};
			const attributes: AttributePair[] = [];

			for (const [index, header] of headers.entries()) {
				const headerTrimmed = header.trim();
				const value = values[index] ? String(values[index]).trim() : '';

				if (validAtrValues.has(headerTrimmed)) {
					// C'est un code atr_value connu en BDD
					attributes.push({
						atrValueCode: headerTrimmed,
						atrValue: value || null
					});
				} else {
					// C'est une colonne métier
					row[headerTrimmed] = value;
				}
			}

			allRows.push(row as unknown as CSVRow);
			allAttributes.push({
				pro_cenov_id: row['pro_cenov_id'] || `ligne_${lineIndex + 1}`,
				attributes
			});
		}

		console.log(`✅ ${allRows.length} produit(s) détecté(s)`);
		return { success: true, data: allRows, attributes: allAttributes };
	} catch (error) {
		return {
			success: false,
			data: [],
			attributes: [],
			error: `Erreur parsing: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
		};
	}
}

// ============================================================================
// VALIDATION CSV
// ============================================================================
export async function validateCSVData(
	data: CSVRow[],
	config: {
		requiredFields: string[];
		numericFields: string[];
		dateFields: string[];
		fieldMapping: Record<string, { table: string; field: string }>;
		fieldMaxLengths: Record<string, number>;
	}
): Promise<ValidationResult> {
	const errors: ValidationError[] = [];
	const warnings: ValidationError[] = [];
	const rowValidityMap = new Map<number, boolean>(); // Track validity per line
	const seenSupplierProducts = new Map<string, number>(); // key: "sup_code:pro_code" → first line number

	// ✅ VALIDATION COHÉRENCE INTERNE CSV - PRIORITÉ 1
	const supplierLabels = new Map<string, { label: string; line: number }>(); // sup_code → { label, line }
	const categoryLabels = new Map<string, { label: string; line: number }>(); // cat_code → { label, line }

	for (let i = 0; i < data.length; i++) {
		const row = data[i];
		const lineNumber = i + 2;
		let rowValid = true;

		for (const field of config.requiredFields) {
			const value = row[field as keyof CSVRow];
			if (!value || (typeof value === 'string' && value.trim() === '')) {
				errors.push({
					line: lineNumber,
					field,
					value: value || '',
					error: 'Champ obligatoire manquant'
				});
				rowValid = false;
			}
		}

		for (const field of config.numericFields) {
			const value = row[field as keyof CSVRow];
			if (value && typeof value === 'string' && value.trim() !== '') {
				const numValue = Number.parseFloat(value);
				if (Number.isNaN(numValue)) {
					errors.push({ line: lineNumber, field, value, error: 'Format numérique invalide' });
					rowValid = false;
				}
				if (field === 'pp_amount' && numValue <= 0) {
					errors.push({ line: lineNumber, field, value, error: 'Le prix doit être > 0' });
					rowValid = false;
				}
				if (field === 'pp_discount') {
					if (numValue < 0 || numValue > 100) {
						errors.push({
							line: lineNumber,
							field,
							value,
							error: 'La remise doit être entre 0 et 100%'
						});
						rowValid = false;
					}
				}
			}
		}

		for (const field of config.dateFields) {
			const value = row[field as keyof CSVRow];
			if (value && typeof value === 'string' && value.trim() !== '') {
				const isoDate = convertToISODate(value);
				if (isoDate) {
					const date = new Date(isoDate);
					if (Number.isNaN(date.getTime())) {
						errors.push({ line: lineNumber, field, value, error: 'Date invalide' });
						rowValid = false;
					} else {
						(row[field as keyof CSVRow] as string) = isoDate;
					}
				} else {
					errors.push({
						line: lineNumber,
						field,
						value,
						error: 'Format date invalide (YYYY-MM-DD ou DD/MM/YYYY)'
					});
					rowValid = false;
				}
			}
		}

		for (const [csvField, mapping] of Object.entries(config.fieldMapping)) {
			const value = row[csvField as keyof CSVRow];
			if (value && typeof value === 'string' && value.trim() !== '') {
				const maxLength = config.fieldMaxLengths[`${mapping.table}.${mapping.field}`];
				if (maxLength && value.length > maxLength) {
					errors.push({
						line: lineNumber,
						field: csvField,
						value,
						error: `Trop long (${value.length}/${maxLength})`
					});
					rowValid = false;
				}
			}
		}

		// Validation conditionnelle hiérarchie famille
		const sousFamille = row.sous_famille;
		const sousSousFamille = row.sous_sous_famille;
		const famille = row.famille;

		if (sousSousFamille && typeof sousSousFamille === 'string' && sousSousFamille.trim() !== '') {
			// Si sous_sous_famille présent → famille ET sous_famille obligatoires
			if (!famille || (typeof famille === 'string' && famille.trim() === '')) {
				errors.push({
					line: lineNumber,
					field: 'famille',
					value: famille || '',
					error: 'Champ obligatoire si "sous_sous_famille" est renseigné'
				});
				rowValid = false;
			}
			if (!sousFamille || (typeof sousFamille === 'string' && sousFamille.trim() === '')) {
				errors.push({
					line: lineNumber,
					field: 'sous_famille',
					value: sousFamille || '',
					error: 'Champ obligatoire si "sous_sous_famille" est renseigné'
				});
				rowValid = false;
			}
		} else if (sousFamille && typeof sousFamille === 'string' && sousFamille.trim() !== '') {
			// Si sous_famille présent → famille obligatoire
			if (!famille || (typeof famille === 'string' && famille.trim() === '')) {
				errors.push({
					line: lineNumber,
					field: 'famille',
					value: famille || '',
					error: 'Champ obligatoire si "sous_famille" est renseigné'
				});
				rowValid = false;
			}
		}

		// ✅ VALIDATION : Vérifier que (sup_code, pro_code) est unique dans le CSV
		const sup_code = row.sup_code;
		const pro_code = row.pro_code;

		if (sup_code && pro_code) {
			const key = `${sup_code}:${pro_code}`;
			const firstOccurrence = seenSupplierProducts.get(key);

			if (firstOccurrence === undefined) {
				// Première occurrence
				seenSupplierProducts.set(key, lineNumber);
			} else {
				// Doublon détecté
				errors.push({
					line: lineNumber,
					field: 'pro_code',
					value: pro_code,
					error: `Doublon : (${sup_code}, ${pro_code}) existe déjà ligne ${firstOccurrence}`
				});
				rowValid = false;
			}
		}

		// ✅ VALIDATION COHÉRENCE INTERNE CSV - Même sup_code doit avoir même sup_label
		const sup_label = row.sup_label;
		if (sup_code && sup_label) {
			const existingSupplier = supplierLabels.get(sup_code);
			if (existingSupplier) {
				// Vérifier que le label est identique
				if (existingSupplier.label !== sup_label) {
					errors.push({
						line: lineNumber,
						field: 'sup_label',
						value: sup_label,
						error: `Incohérence : fournisseur ${sup_code} a différents noms (ligne ${existingSupplier.line}: "${existingSupplier.label}", ligne ${lineNumber}: "${sup_label}")`
					});
					rowValid = false;
				}
			} else {
				// Première occurrence de ce sup_code
				supplierLabels.set(sup_code, { label: sup_label, line: lineNumber });
			}
		}

		// ✅ VALIDATION COHÉRENCE INTERNE CSV - Même cat_code doit avoir même cat_label
		const cat_code = row.cat_code;
		const cat_label = row.cat_label;
		if (cat_code && cat_label) {
			const existingCategory = categoryLabels.get(cat_code);
			if (existingCategory) {
				// Vérifier que le label est identique
				if (existingCategory.label !== cat_label) {
					errors.push({
						line: lineNumber,
						field: 'cat_label',
						value: cat_label,
						error: `Incohérence : catégorie ${cat_code} a différents noms (ligne ${existingCategory.line}: "${existingCategory.label}", ligne ${lineNumber}: "${cat_label}")`
					});
					rowValid = false;
				}
			} else {
				// Première occurrence de ce cat_code
				categoryLabels.set(cat_code, { label: cat_label, line: lineNumber });
			}
		}

		rowValidityMap.set(lineNumber, rowValid);
	}

	// Compter les lignes valides
	const validRows = Array.from(rowValidityMap.values()).filter(Boolean).length;

	return { success: errors.length === 0, totalRows: data.length, validRows, errors, warnings };
}

// ============================================================================
// VALIDATION ATTRIBUTS
// ============================================================================
export async function validateAttributes(
	attributes: AttributePair[],
	database: 'cenov_dev' | 'cenov_preprod' = 'cenov_dev'
): Promise<ValidationResult> {
	const errors: ValidationError[] = [];
	const warnings: ValidationError[] = [];

	const attributeMap = await loadAttributeReference(database);
	const attributeUnitsMap = await loadAttributeUnitsEnriched(database);

	const attributeIds = attributes
		.filter((a) => a.atrValue && attributeMap.has(a.atrValueCode))
		.map((a) => attributeMap.get(a.atrValueCode)!.atr_id);

	const allowedValuesMap = await loadAllowedValues(attributeIds, database);

	for (let i = 0; i < attributes.length; i++) {
		const { atrValueCode, atrValue } = attributes[i];
		if (!atrValue || atrValue.trim() === '') continue;

		const attribute = attributeMap.get(atrValueCode);
		if (!attribute) {
			errors.push({
				line: i + 1,
				field: atrValueCode,
				value: atrValue,
				error: 'Code attribut inconnu'
			});
			continue;
		}

		const allowedValues = allowedValuesMap.get(attribute.atr_id);

		if (allowedValues && allowedValues.size > 0) {
			if (!allowedValues.has(atrValue)) {
				const allowedList = Array.from(allowedValues).join(', ');
				errors.push({
					line: i + 1,
					field: atrValueCode,
					value: atrValue,
					error: `Valeur non autorisée. Acceptées: ${allowedList}`
				});
			}
		} else {
			const { unit } = parseValueAndUnit(atrValue);
			if (unit) {
				const unitsData = attributeUnitsMap.get(attribute.atr_id);
				if (unitsData && unitsData.units.length > 0) {
					const unitId = findUnitId(attribute.atr_id, unit, attributeUnitsMap);
					if (!unitId) {
						const allowedUnits = unitsData.units.map((u) => u.unit_value).join(', ');
						errors.push({
							line: i + 1,
							field: atrValueCode,
							value: atrValue,
							error: `Unité "${unit}" invalide. Acceptées: ${allowedUnits}`
						});
					}
				}
			}
		}
	}

	return {
		success: errors.length === 0,
		totalRows: attributes.length,
		validRows: attributes.length - errors.length,
		errors,
		warnings
	};
}

// ============================================================================
// VALIDATION ATTRIBUTS OBLIGATOIRES
// ============================================================================

/**
 * Valide que tous les attributs obligatoires sont présents pour chaque produit
 */
export async function validateRequiredAttributes(
	data: CSVRow[],
	attributesByProduct: ProductAttributes[],
	database: 'cenov_dev' | 'cenov_preprod' = 'cenov_dev'
): Promise<ValidationResult> {
	const errors: ValidationError[] = [];
	const warnings: ValidationError[] = [];

	// 1. Collecter tous les cat_code uniques
	const uniqueCatCodes = Array.from(new Set(data.map((row) => row.cat_code).filter(Boolean)));

	if (uniqueCatCodes.length === 0) {
		return { success: true, totalRows: data.length, validRows: data.length, errors, warnings };
	}

	// 2. Charger métadonnées catégories + détecter doublons
	const { categoriesMap, duplicates } = await loadCategoriesMetadata(uniqueCatCodes, database);

	// 3. ERREUR BLOQUANTE si doublons cat_code
	if (duplicates.length > 0) {
		for (const dup of duplicates) {
			errors.push({
				line: 0, // Erreur globale BDD
				field: 'cat_code',
				value: dup.cat_code,
				error: `ERREUR BDD: ${dup.labels.length} catégories racines avec le code ${dup.cat_code}. Labels: ${dup.labels.join(', ')}. Corrigez la base de données avant import.`
			});
		}
		return { success: false, totalRows: data.length, validRows: 0, errors, warnings };
	}

	// 4. Cache pour attributs obligatoires avec héritage (optimisation performance)
	const requiredAttrsCache = new Map<
		number,
		Array<{
			atr_id: number;
			atr_value: string;
			atr_label: string;
			inherited: boolean;
			fromCatId: number;
			fromCatLabel: string;
		}>
	>();

	// 5. Détecter attributs du CSV pour les catégories inconnues (pour auto-liaison)
	const unknownCategoryAttrs = new Map<string, Set<string>>(); // cat_code → Set<atr_value>

	// 6. Valider chaque produit
	for (let i = 0; i < data.length; i++) {
		const row = data[i];
		const lineNumber = i + 2;
		const productAttrs = attributesByProduct.find((a) => a.pro_cenov_id === row.pro_cenov_id);

		if (!productAttrs) continue;

		const category = categoriesMap.get(row.cat_code);

		// CAS 1: Catégorie inconnue
		if (!category) {
			warnings.push({
				line: lineNumber,
				field: 'cat_code',
				value: row.cat_code,
				error: `Catégorie "${row.cat_code}" inconnue en BDD. Elle sera créée automatiquement lors de l'import avec ${productAttrs.attributes.length} attribut(s) (tous optionnels).`
			});

			// Stocker attributs pour auto-liaison lors de l'import
			if (!unknownCategoryAttrs.has(row.cat_code)) {
				unknownCategoryAttrs.set(row.cat_code, new Set());
			}
			for (const attr of productAttrs.attributes) {
				unknownCategoryAttrs.get(row.cat_code)!.add(attr.atrValueCode);
			}

			continue; // Pas de validation attributs obligatoires
		}

		// CAS 2: Catégorie connue - vérifier attributs obligatoires (directs + hérités)
		// Utiliser cache pour éviter requêtes BDD répétées
		if (!requiredAttrsCache.has(category.cat_id)) {
			const attrs = await getCategoryRequiredAttributesWithInheritance(category.cat_id, database);
			requiredAttrsCache.set(category.cat_id, attrs);
		}

		const requiredAttrs = requiredAttrsCache.get(category.cat_id)!;

		if (requiredAttrs.length === 0) {
			// Aucun attribut obligatoire (ni direct ni hérité)
			continue;
		}

		// Vérifier présence de tous les attributs obligatoires
		const csvAttrCodes = new Set(productAttrs.attributes.map((a) => a.atrValueCode));
		const missingAttrs = requiredAttrs.filter((req) => !csvAttrCodes.has(req.atr_value));

		if (missingAttrs.length > 0) {
			// Message d'erreur avec indication de l'origine (hérité ou direct)
			const errorDetails = missingAttrs
				.map((m) => {
					if (m.inherited) {
						return `${m.atr_label} (hérité de "${m.fromCatLabel}")`;
					}
					return m.atr_label;
				})
				.join(', ');

			errors.push({
				line: lineNumber,
				field: 'attributs_obligatoires',
				value: row.cat_code,
				error: `Catégorie "${category.cat_label}" (${row.cat_code}) requiert ${missingAttrs.length} attribut(s) manquant(s): ${errorDetails}`
			});
		}
	}

	const validRows = data.length - errors.length;

	return {
		success: errors.length === 0,
		totalRows: data.length,
		validRows,
		errors,
		warnings
	};
}
