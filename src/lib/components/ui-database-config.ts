// Configuration UI centralisée pour bases de données, schémas et tables
// Utilisé par import, export et tous les composants

// Imports pour utilisation locale dans ce fichier
import {
	Rocket as RocketIcon,
	Bug as BugIcon,
	FlaskConical as FlaskConicalIcon,
	LockOpen as LockOpenIcon,
	Package as PackageIcon,
	FolderCode as FolderCodeIcon,
	Eye as EyeIcon,
	Table as TableIconComponent
} from 'lucide-svelte';

// Re-export des icônes pour utilisation externe
export { Rocket } from 'lucide-svelte';
export { Bug } from 'lucide-svelte';
export { FlaskConical } from 'lucide-svelte';
export { FolderCode } from 'lucide-svelte';
export { LockOpen } from 'lucide-svelte';
export { Package } from 'lucide-svelte';
export { Eye } from 'lucide-svelte';
export { Table as TableIcon } from 'lucide-svelte';

// ========== TYPES ==========
export type DatabaseName = 'cenov' | 'cenov_dev' | 'cenov_preprod';
export type SchemaName = 'produit' | 'public' | 'sas';
export type BadgeVariant = 'bleu' | 'orange' | 'vert' | 'noir' | 'purple' | 'cyan' | 'jaune' | 'lime';

// ========== CONFIGURATION ==========
export const DATABASE_CONFIG = {
	cenov: {
		icon: RocketIcon,
		variant: 'bleu' as const,
		emoji: '🚀',
		label: 'CENOV'
	},
	cenov_dev: {
		icon: BugIcon,
		variant: 'orange' as const,
		emoji: '🐛',
		label: 'CENOV_DEV'
	},
	cenov_preprod: {
		icon: FlaskConicalIcon,
		variant: 'jaune' as const,
		emoji: '🧪',
		label: 'CENOV_PREPROD'
	}
} as const;

export const SCHEMA_CONFIG = {
	produit: {
		icon: PackageIcon,
		label: 'Produit',
		variant: 'purple' as const
	},
	public: {
		icon: LockOpenIcon,
		label: 'Public',
		variant: 'cyan' as const
	},
	sas: {
		icon: FolderCodeIcon,
		label: 'SAS',
		variant: 'lime' as const
	}
} as const;

// ========== FONCTIONS UTILITAIRES ==========

// Obtenir infos badge database
export function getDatabaseBadgeInfo(database: string) {
	let config;
	if (database.includes('preprod')) {
		config = DATABASE_CONFIG.cenov_preprod;
	} else if (database.includes('dev')) {
		config = DATABASE_CONFIG.cenov_dev;
	} else {
		config = DATABASE_CONFIG.cenov;
	}
	return {
		variant: config.variant,
		label: `${config.emoji} ${config.label}`,
		icon: config.icon
	};
}

// Obtenir icône database
export function getDatabaseIcon(database: string) {
	if (database.includes('preprod')) return FlaskConicalIcon;
	if (database.includes('dev')) return BugIcon;
	return RocketIcon;
}

// Obtenir icône schéma
export function getSchemaIcon(schema: string) {
	return SCHEMA_CONFIG[schema as SchemaName]?.icon || LockOpenIcon;
}

// Obtenir icône table/vue
export function getTableIcon(category?: string) {
	return category === 'view' || category === 'views' ? EyeIcon : TableIconComponent;
}

// Obtenir variant badge table/vue
export function getBadgeVariant(category?: string): 'vert' | 'noir' {
	return category === 'view' ? 'vert' : 'noir';
}

// Parser "database-tableName" (export)
export function parseTableName(tableName: string): string {
	if (tableName.includes('-')) {
		return tableName.split('-').slice(1).join('-');
	}
	return tableName;
}
