import type { WordPressProduct } from '../repositories/wordpress.repository';

/**
 * Ajoute des guillemets à un header CSV SEULEMENT s'il contient des caractères spéciaux
 * Règle WordPress : guillemets pour virgule, ?, (), espaces, apostrophes (droite ' ou courbe ') - sinon pas de guillemets
 * @returns Header avec ou sans guillemets selon le contenu
 */
function quoteHeaderIfNeeded(header: string): string {
	// Si contient caractères spéciaux → guillemets
	if (
		header.includes(',') ||
		header.includes('?') ||
		header.includes(' ') ||
		header.includes("'") || // Apostrophe droite
		header.includes('\u2019') || // Apostrophe courbe '
		header.includes('(') ||
		header.includes(')')
	) {
		return `"${header}"`;
	}
	// Sinon → pas de guillemets
	return header;
}

/**
 * En-têtes CSV fixes (colonnes de base du produit)
 * IMPORTANT : WordPress utilise :
 * 1. Guillemets SEULEMENT pour headers avec caractères spéciaux
 * 2. Espaces INSÉCABLES (\u00A0) avant les points d'interrogation
 * @see https://woocommerce.com/document/product-csv-import-schema/
 */
const BASE_CSV_HEADERS = [
	'Type', // Simple → pas de guillemets
	'UGS', // Simple → pas de guillemets
	'Nom', // Simple → pas de guillemets
	'Publié', // Simple → pas de guillemets
	'Mis en avant\u00A0?', // Espace insécable + "?" → sera quoté
	'Visibilité dans le catalogue', // A espaces → sera quoté
	'Description courte', // A espace → sera quoté
	'Description', // Simple → pas de guillemets
	'En stock\u00A0?', // Espace insécable + "?" → sera quoté
	'Tarif régulier', // A espace → sera quoté
	'Catégories', // Simple → pas de guillemets
	'Images', // Simple → pas de guillemets
	'Brand' // Simple → pas de guillemets
] as const;

/**
 * Échappe une valeur pour l'inclusion dans un CSV
 * Règles RFC 4180 :
 * - Guillemets doubles doublés : " devient ""
 * - Champs avec virgules, guillemets ou sauts de ligne encadrés par "
 * - Valeurs null/undefined deviennent chaîne vide
 *
 * @param value Valeur à échapper
 * @returns Valeur échappée prête pour CSV
 */
function escapeCSV(value: string | null | undefined): string {
	if (value === null || value === undefined) return '';

	const str = String(value);

	// Si contient guillemets, virgules ou sauts de ligne → encadrer et échapper
	if (str.includes('"') || str.includes(',') || str.includes('\n')) {
		return `"${str.replaceAll('"', '""')}"`;
	}

	return str;
}

/**
 * Génère une ligne CSV pour un produit WordPress avec attributs
 * @param product Produit WordPress
 * @param maxAttributes Nombre max d'attributs (pour padding)
 * @returns Ligne CSV formatée
 */
function generateRow(product: WordPressProduct, maxAttributes: number): string {
	// Colonnes fixes de base
	const baseColumns = [
		escapeCSV(product.type),
		escapeCSV(product.sku),
		escapeCSV(product.name),
		product.published ? '1' : '0',
		product.featured ? '1' : '0',
		escapeCSV(product.visibility),
		escapeCSV(product.short_description),
		escapeCSV(product.description),
		product.in_stock ? '1' : '0',
		escapeCSV(product.regular_price),
		escapeCSV(product.categories),
		escapeCSV(product.images),
		escapeCSV(product.brand)
	];

	// Colonnes attributs (4 colonnes par attribut : nom, valeur, visible, global)
	const attributeColumns: string[] = [];

	for (let i = 0; i < maxAttributes; i++) {
		const attr = product.attributes[i];

		if (attr) {
			attributeColumns.push(
				escapeCSV(attr.name),
				escapeCSV(attr.value),
				attr.visible ? '1' : '0',
				attr.global ? '1' : '0'
			);
		} else {
			// Padding : colonnes vides si produit a moins d'attributs
			attributeColumns.push('', '', '', '');
		}
	}

	return [...baseColumns, ...attributeColumns].join(',');
}

/**
 * Génère un fichier CSV complet pour import WordPress/WooCommerce avec attributs
 *
 * Format attendu :
 * ```csv
 * Type,UGS,Nom,...,Brand,Nom de l'attribut 1,Valeur(s) de l'attribut 1,Attribut 1 visible,Attribut 1 global,...
 * simple,PRO123,Pompe,...,Brand,POIDS,4,1,1,TENSION,230,1,1
 * ```
 *
 * ⚠️ BOM UTF-8 ajouté pour garantir encodage correct dans Excel/LibreOffice
 *
 * @param products Liste des produits à exporter
 * @returns Contenu CSV complet avec en-têtes et BOM UTF-8
 */
export function generateWordPressCSV(products: WordPressProduct[]): string {
	// BOM UTF-8 pour garantir encodage correct dans Excel/LibreOffice
	const BOM = '\uFEFF';

	// Calculer le nombre max d'attributs
	const maxAttributes = Math.max(...products.map((p) => p.attributes.length), 0);

	// Générer headers dynamiques
	// IMPORTANT : WordPress utilise :
	// 1. Guillemets SEULEMENT pour headers avec caractères spéciaux
	// 2. Apostrophe COURBE \u2019 (') au lieu d'apostrophe droite '
	// 3. Espace à la fin de "Valeur(s) de l'attribut X " est obligatoire !
	const headers: string[] = BASE_CSV_HEADERS.map(quoteHeaderIfNeeded);

	for (let i = 1; i <= maxAttributes; i++) {
		headers.push(
			quoteHeaderIfNeeded(`Nom de l\u2019attribut ${i}`), // Apostrophe courbe '
			quoteHeaderIfNeeded(`Valeur(s) de l\u2019attribut ${i} `), // Apostrophe courbe ' + espace à la fin
			quoteHeaderIfNeeded(`Attribut ${i} visible`),
			quoteHeaderIfNeeded(`Attribut ${i} global`)
		);
	}

	// Générer lignes
	const lines = [headers.join(',')];

	for (const product of products) {
		lines.push(generateRow(product, maxAttributes));
	}

	return BOM + lines.join('\n');
}
