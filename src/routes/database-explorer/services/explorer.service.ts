import type { FieldInfo, TableInfo } from '$lib/prisma-meta';
import type { TableMetadata } from '../repositories/explorer.repository';

/**
 * Sélection de table dans la sidebar
 */
export interface TableSelection {
	database: string;
	schema: string;
	tableName: string;
}

/**
 * Structure hiérarchique des bases de données
 */
export interface DatabaseHierarchy {
	[database: string]: {
		[schema: string]: {
			tables: TableInfo[];
			views: TableInfo[];
		};
	};
}

/**
 * Parser une valeur depuis un formulaire pour l'enregistrer en base de données
 */
export function parseValueForDatabase(value: string, field: FieldInfo): unknown {
	if (!value || value.trim() === '') {
		return field.isRequired ? undefined : null;
	}

	switch (field.type) {
		case 'Int':
		case 'BigInt':
			return Number.parseInt(value, 10);
		case 'Float':
		case 'Decimal':
			return Number.parseFloat(value);
		case 'Boolean':
			return ['true', '1', 'yes', 'oui'].includes(value.toLowerCase());
		case 'DateTime':
			return new Date(value).toISOString();
		default:
			return value;
	}
}

/**
 * Générer un résumé lisible d'un enregistrement pour la modal de suppression
 */
export function generateRecordSummary(
	record: Record<string, unknown>,
	metadata: TableMetadata
): string {
	const pkValue = record[metadata.primaryKey];
	const nameField = metadata.fields.find(
		(f) => f.name.includes('name') || f.name.includes('label') || f.name.includes('code')
	);

	if (nameField && record[nameField.name]) {
		return `${metadata.name} #${pkValue} - ${record[nameField.name]}`;
	}

	return `${metadata.name} #${pkValue}`;
}

/**
 * Grouper les tables par hiérarchie base → schéma → tables/vues
 */
export function groupTablesByHierarchy(tables: TableInfo[]): DatabaseHierarchy {
	const hierarchy: DatabaseHierarchy = {};

	for (const table of tables) {
		if (!hierarchy[table.database]) {
			hierarchy[table.database] = {};
		}
		if (!hierarchy[table.database][table.schema]) {
			hierarchy[table.database][table.schema] = { tables: [], views: [] };
		}

		if (table.category === 'table') {
			hierarchy[table.database][table.schema].tables.push(table);
		} else {
			hierarchy[table.database][table.schema].views.push(table);
		}
	}

	return hierarchy;
}

/**
 * Obtenir le label d'affichage pour une base de données
 */
export function getDatabaseLabel(database: string): string {
	const labels: Record<string, string> = {
		cenov: 'CENOV',
		cenov_dev: 'CENOV_DEV',
		cenov_preprod: 'CENOV_PREPROD'
	};
	return labels[database] || database.toUpperCase();
}

/**
 * Obtenir la variante de badge pour une base de données
 */
export function getDatabaseBadgeVariant(database: string): 'bleu' | 'vert' | 'orange' | 'default' {
	const variants: Record<string, 'bleu' | 'vert' | 'orange' | 'default'> = {
		cenov: 'bleu',
		cenov_dev: 'vert',
		cenov_preprod: 'orange'
	};
	return variants[database] || 'default';
}
