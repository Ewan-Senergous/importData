// src/lib/prisma-meta.ts - Utilitaires PARTAGÉS pour métadonnées Prisma DMMF
//
// ⚠️ RÈGLE IMPORTANTE : Ce fichier contient UNIQUEMENT des fonctions PARTAGÉES utilisées par PLUSIEURS pages/composants
//
// ✅ À METTRE ICI :
// - getTableMetadata() : utilisé par import, export, kits, categories, etc.
// - getAllTables() : utilisé par import, export, navigation, etc.
// - findRecord(), createRecord(), updateRecord() : CRUD générique pour toutes les tables
// - getDatabases() : accès aux clients Prisma partagé
//
// ❌ À NE PAS METTRE ICI :
// - Schémas Zod spécifiques à une page (ex: kitSchema → dans +page.server.ts kits)
// - Fonctions métier spécifiques (ex: createKitWithTransaction → dans +page.server.ts kits)
// - Logique UI spécifique (ex: formatage pour DataTable → dans le composant)
//
// 💡 PRINCIPE : Si c'est utilisé par 2+ pages = ici, sinon = dans la page concernée
import { browser } from '$app/environment';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '$env/dynamic/private';

// Types pour les modules Prisma
interface PrismaModule {
	Prisma: {
		dmmf: {
			datamodel: {
				models: Array<{
					name: string;
					fields: Array<{
						name: string;
						type: string;
						isRequired: boolean;
						isId: boolean;
						kind: string;
					}>;
				}>;
			};
		};
	};
	PrismaClient: new (config?: { adapter?: unknown }) => Record<string, unknown>;
}

// Variables globales typées
let Prisma: PrismaModule['Prisma'] | undefined;
let PrismaClient: PrismaModule['PrismaClient'] | undefined;
let prismaModule: PrismaModule | undefined;

// Import côté serveur uniquement - Prisma 7 avec chemins dans src/generated
async function initializePrisma() {
	if (!browser && !prismaModule) {
		const imported = (await import('../generated/prisma-cenov/client')) as unknown as PrismaModule;
		prismaModule = imported;
		Prisma = imported.Prisma;
		PrismaClient = imported.PrismaClient;
	}
}

// Client de développement typé
let CenovDevPrisma: PrismaModule['Prisma'] | undefined;
let CenovDevPrismaClient: PrismaModule['PrismaClient'] | undefined;

// Client de pré-production typé
let CenovPreprodPrisma: PrismaModule['Prisma'] | undefined;
let CenovPreprodPrismaClient: PrismaModule['PrismaClient'] | undefined;

// Initialisation du client de développement - Solution hybride dev/prod
async function initializeCenovDevPrisma() {
	if (browser) return;

	await initializePrisma();

	// TOUJOURS charger le client dev - Simplifié avec Prisma 7
	try {
		// Import direct depuis src/generated (Prisma 7)
		const devPrismaModule =
			(await import('../generated/prisma-cenov-dev/client')) as unknown as PrismaModule;

		if (devPrismaModule?.Prisma && devPrismaModule?.PrismaClient) {
			CenovDevPrisma = devPrismaModule.Prisma;
			CenovDevPrismaClient = devPrismaModule.PrismaClient;
		} else {
			throw new Error('Module dev invalide - Prisma/PrismaClient manquants');
		}
	} catch (error) {
		console.warn('[PRISMA-META] Erreur chargement client dev:', error);
		// Fallback au client principal
		CenovDevPrisma = Prisma;
		CenovDevPrismaClient = PrismaClient;
	}
}

// Initialisation du client de pré-production
async function initializeCenovPreprodPrisma() {
	if (browser) return;

	await initializePrisma();

	try {
		// Import direct depuis src/generated (Prisma 7)
		const preprodPrismaModule =
			(await import('../generated/prisma-cenov-preprod/client')) as unknown as PrismaModule;

		if (preprodPrismaModule?.Prisma && preprodPrismaModule?.PrismaClient) {
			CenovPreprodPrisma = preprodPrismaModule.Prisma;
			CenovPreprodPrismaClient = preprodPrismaModule.PrismaClient;
		} else {
			throw new Error('Module preprod invalide - Prisma/PrismaClient manquants');
		}
	} catch (error) {
		console.warn('[PRISMA-META] Erreur chargement client preprod:', error);
		// Fallback au client principal
		CenovPreprodPrisma = Prisma;
		CenovPreprodPrismaClient = PrismaClient;
	}
}

export type DatabaseName = 'cenov' | 'cenov_dev' | 'cenov_preprod';

export interface TableInfo {
	name: string;
	displayName: string;
	category: 'table' | 'view';
	database: DatabaseName;
	schema: string;
	rowCount?: number;
	columns?: FieldInfo[];
}

export interface FieldInfo {
	name: string;
	type: string;
	isRequired: boolean;
	isPrimaryKey: boolean;
	isTimestamp?: boolean;
	dbType?: string;
}

// Interface pour les bases de données
interface DatabaseConfig {
	cenov: {
		dmmf: PrismaModule['Prisma']['dmmf'];
		client: Record<string, unknown>;
	};
	cenov_dev: {
		dmmf: PrismaModule['Prisma']['dmmf'];
		client: Record<string, unknown>;
	};
	cenov_preprod: {
		dmmf: PrismaModule['Prisma']['dmmf'];
		client: Record<string, unknown>;
	};
}

// Cache pour les bases de données (singleton)
let databasesCache: DatabaseConfig | null = null;

// Fonction pour invalider le cache (utile pour les recharges)
export function clearDatabaseCache() {
	databasesCache = null;
}

// Configuration des bases - création unique (côté serveur uniquement)
async function createDatabases(): Promise<DatabaseConfig> {
	if (browser) {
		throw new Error('[PRISMA-META] createDatabases ne peut être appelé côté client');
	}

	await initializePrisma();
	await initializeCenovDevPrisma();
	await initializeCenovPreprodPrisma();

	if (
		!Prisma ||
		!PrismaClient ||
		!CenovDevPrisma ||
		!CenovDevPrismaClient ||
		!CenovPreprodPrisma ||
		!CenovPreprodPrismaClient
	) {
		throw new Error('[PRISMA-META] Modules Prisma non initialisés');
	}

	// Créer les adapters PostgreSQL pour Prisma 7
	const cenovAdapter = new PrismaPg({
		connectionString: env.DATABASE_URL
	});

	const devAdapter = new PrismaPg({
		connectionString: env.CENOV_DEV_DATABASE_URL
	});

	const preprodAdapter = new PrismaPg({
		connectionString: env.CENOV_PREPROD_DATABASE_URL
	});

	// Créer les clients Prisma
	const cenovClient = new PrismaClient({ adapter: cenovAdapter }) as {
		_runtimeDataModel: { models: Record<string, unknown> };
	} & Record<string, unknown>;

	const devClient = new CenovDevPrismaClient({ adapter: devAdapter }) as {
		_runtimeDataModel: { models: Record<string, unknown> };
	} & Record<string, unknown>;

	const preprodClient = new CenovPreprodPrismaClient({ adapter: preprodAdapter }) as {
		_runtimeDataModel: { models: Record<string, unknown> };
	} & Record<string, unknown>;

	// Dans Prisma 7, extraire le DMMF depuis _runtimeDataModel + schéma parsé depuis schema.prisma
	// Utiliser process.cwd() au lieu de import.meta.url pour compatibilité DEV/PROD
	const fs = await import('node:fs/promises');
	const path = await import('node:path');

	// process.cwd() pointe toujours vers la racine du projet (DEV et PROD)
	const projectRoot = process.cwd();

	let cenovSchema = '';
	let devSchema = '';
	let preprodSchema = '';

	try {
		cenovSchema = await fs.readFile(path.join(projectRoot, 'prisma/cenov/schema.prisma'), 'utf-8');
		devSchema = await fs.readFile(
			path.join(projectRoot, 'prisma/cenov_dev/schema.prisma'),
			'utf-8'
		);
		preprodSchema = await fs.readFile(
			path.join(projectRoot, 'prisma/cenov_preprod/schema.prisma'),
			'utf-8'
		);
		console.log('[PRISMA-META] Schémas chargés avec succès depuis:', projectRoot);
	} catch (error) {
		console.warn('[PRISMA-META] Erreur lecture schema.prisma depuis', projectRoot, ':', error);
	}

	const cenovDmmf = convertRuntimeDataModelToDMMF(cenovClient._runtimeDataModel, cenovSchema);
	const devDmmf = convertRuntimeDataModelToDMMF(devClient._runtimeDataModel, devSchema);
	const preprodDmmf = convertRuntimeDataModelToDMMF(preprodClient._runtimeDataModel, preprodSchema);

	return {
		cenov: {
			dmmf: cenovDmmf,
			client: cenovClient
		},
		cenov_dev: {
			dmmf: devDmmf,
			client: devClient
		},
		cenov_preprod: {
			dmmf: preprodDmmf,
			client: preprodClient
		}
	};
}

// Structure pour les métadonnées parsées depuis schema.prisma
interface ParsedModelMetadata {
	schema: string;
	primaryKeyFields: string[];
	isView: boolean;
}

// Parser le schéma inline pour extraire le mapping modèle → métadonnées complètes
function parseSchemaMetadata(inlineSchema: string): Map<string, ParsedModelMetadata> {
	const metadataMap = new Map<string, ParsedModelMetadata>();

	// Pattern pour capturer un modèle/vue complet avec son contenu
	// Capture : (model|view) NomModel { ... contenu ... }
	const blockRegex = /(model|view)\s+(\w+)\s*\{([^}]+)\}/g;

	let blockMatch;
	while ((blockMatch = blockRegex.exec(inlineSchema)) !== null) {
		const [, type, modelName, content] = blockMatch;

		// Parser le schéma (@@schema("nom"))
		const schemaRegex = /@@schema\("([^"]+)"\)/;
		const schemaMatch = schemaRegex.exec(content);
		const schema = schemaMatch ? schemaMatch[1] : 'public';

		// Parser la clé primaire
		const primaryKeyFields: string[] = [];

		// 1. Clé primaire composite : @@id([field1, field2])
		const compositeIdRegex = /@@id\(\[([^\]]+)\]/;
		const compositeIdMatch = compositeIdRegex.exec(content);
		if (compositeIdMatch) {
			const fields = compositeIdMatch[1].split(',').map((f) => f.trim());
			primaryKeyFields.push(...fields);
		} else {
			// 2. Clés primaires simples : field Type @id
			const simpleIdRegex = /(\w+)\s+\w+[^\n]*@id/g;
			let idMatch;
			while ((idMatch = simpleIdRegex.exec(content)) !== null) {
				primaryKeyFields.push(idMatch[1]);
			}
		}

		metadataMap.set(modelName, {
			schema,
			primaryKeyFields,
			isView: type === 'view'
		});
	}

	return metadataMap;
}

// Convertir le runtimeDataModel de Prisma 7 en format DMMF compatible
function convertRuntimeDataModelToDMMF(
	runtimeDataModel: {
		models: Record<string, unknown>;
	},
	inlineSchema?: string
): PrismaModule['Prisma']['dmmf'] {
	// Parser le schéma inline pour obtenir les métadonnées complètes (schéma + clés primaires + type)
	const metadataMap = inlineSchema
		? parseSchemaMetadata(inlineSchema)
		: new Map<string, ParsedModelMetadata>();

	const models = Object.entries(runtimeDataModel.models).map(([name, modelData]) => {
		const model = modelData as {
			fields: Array<{
				name: string;
				kind: string;
				type: string;
				isRequired?: boolean;
				isId?: boolean;
			}>;
			dbName?: string;
			schema?: string;
			primaryKey?: { fields?: string[] } | null;
			uniqueIndexes?: Array<{ fields?: string[] }>;
		};

		// Récupérer les métadonnées parsées depuis schema.prisma
		const metadata = metadataMap.get(name);
		const schema = metadata?.schema || 'public';
		const primaryKeyFields = metadata?.primaryKeyFields || [];

		// Construire l'objet primaryKey au format DMMF
		const primaryKey = primaryKeyFields.length > 0 ? { fields: primaryKeyFields } : null;

		// Marquer les champs comme isId selon les clés primaires parsées
		const fieldsWithId = model.fields.map((field) => ({
			name: field.name,
			kind: field.kind,
			type: field.type,
			isRequired: field.isRequired ?? false,
			isId: primaryKeyFields.includes(field.name) // ✅ FIXÉ : Détecter isId depuis schema.prisma
		}));

		return {
			name,
			dbName: model.dbName,
			schema, // ✅ FIXÉ : Utiliser le schéma parsé depuis schema.prisma
			fields: fieldsWithId,
			primaryKey, // ✅ FIXÉ : Utiliser la clé primaire parsée depuis schema.prisma
			uniqueIndexes: model.uniqueIndexes
		};
	});

	return {
		datamodel: {
			models: models as Array<{
				name: string;
				fields: Array<{
					name: string;
					type: string;
					isRequired: boolean;
					isId: boolean;
					kind: string;
				}>;
			}>
		}
	};
}

// Accès aux bases avec cache (côté serveur uniquement)
export async function getDatabases(): Promise<DatabaseConfig> {
	if (browser) {
		throw new Error('[PRISMA-META] getDatabases ne peut être appelé côté client');
	}

	databasesCache ??= await createDatabases();

	return databasesCache;
}

// Obtenir métadonnées d'une table spécifique (côté serveur uniquement)
// Type pour les modèles DMMF réels (avec support @@map)
type DMMFModelFromPrisma = PrismaModule['Prisma']['dmmf']['datamodel']['models'][number] & {
	dbName?: string; // Nom de la table/vue réelle (@@map)
	schema?: string; // Schéma (@@schema)
};

// Détecter la clé primaire via DMMF Prisma
function detectPrimaryKeyFromDMMF(model: DMMFModelFromPrisma): string | null {
	// 1. Clé primaire simple (@id)
	const singlePK = model.fields.find((f) => f.isId);
	if (singlePK) {
		return singlePK.name;
	}

	// 2. Pour les vues : chercher le premier champ "id-like"
	const idLikeFields = model.fields.filter((f) =>
		/^(.*_id|id|pro_id|cat_id|atr_id|kit_id|fam_id|frs_id|par_id|kat_id)$/.test(f.name)
	);

	if (idLikeFields.length > 0) {
		return idLikeFields[0].name;
	}

	// 3. Dernier recours : premier champ
	if (model.fields.length > 0) {
		return model.fields[0].name;
	}

	return null;
}

export async function getTableMetadata(database: DatabaseName, tableName: string) {
	if (browser) {
		throw new Error('[PRISMA-META] getTableMetadata ne peut être appelé côté client');
	}

	const databases = await getDatabases();
	const model = databases[database].dmmf.datamodel.models.find((m) => m.name === tableName);
	if (!model) return null;

	// Détecter la clé primaire intelligemment
	const primaryKey = detectPrimaryKeyFromDMMF(model) || 'id';

	// Extraire le schéma depuis les métadonnées Prisma
	const schema = (model as { schema?: string }).schema || 'public';

	return {
		name: model.name,
		primaryKey,
		schema, // Nouveau champ pour le schéma
		fields: model.fields
			.filter((f) => f.kind === 'scalar')
			.map((f) => ({
				name: f.name,
				type: f.type,
				isRequired: f.isRequired,
				isPrimaryKey: f.isId || false,
				// Détecter les timestamps (DateTime + noms courants)
				isTimestamp:
					f.type === 'DateTime' &&
					/^(created_at|updated_at|deleted_at|timestamp|date_|.*_at)$/i.test(f.name),
				dbType: f.type
			}))
	};
}

// Obtenir le nativeType d'un champ via DMMF (ex: "Date", "Timestamp", etc.)
export async function getFieldNativeType(
	database: DatabaseName,
	tableName: string,
	fieldName: string
): Promise<string | null> {
	if (browser) return null;

	const databases = await getDatabases();
	const model = databases[database].dmmf.datamodel.models.find((m) => m.name === tableName);
	if (!model) return null;

	const field = model.fields.find((f) => f.name === fieldName);
	if (!field || !('nativeType' in field)) return null;

	// nativeType est un tableau: ["Date", []] ou ["Timestamp", ["6"]]
	const nativeType = (field as { nativeType?: [string, string[]] }).nativeType;
	return nativeType ? nativeType[0] : null;
}

// Obtenir les champs de la clé primaire (simple ou composite) via DMMF
export async function getPrimaryKeyFields(
	database: DatabaseName,
	tableName: string
): Promise<string[]> {
	if (browser) return [];

	const databases = await getDatabases();
	const model = databases[database].dmmf.datamodel.models.find((m) => m.name === tableName);
	if (!model) return [];

	const modelWithPK = model as DMMFModelFromPrisma & { primaryKey?: { fields?: string[] } | null };

	// 1. Clé primaire composite (@@id)
	if ((modelWithPK.primaryKey?.fields?.length ?? 0) > 0) {
		return modelWithPK.primaryKey?.fields ?? [];
	}

	// 2. Clé primaire simple (@id)
	const singlePK = model.fields.find((f) => f.isId);
	if (singlePK) {
		return [singlePK.name];
	}

	return [];
}

// Obtenir toutes les tables d'une base (côté serveur uniquement)
export async function getAllTables(database: DatabaseName): Promise<TableInfo[]> {
	if (browser) {
		throw new Error('[PRISMA-META] getAllTables ne peut être appelé côté client');
	}

	const databases = await getDatabases();
	const tables = databases[database].dmmf.datamodel.models.map((model) => {
		const modelWithMeta = model as DMMFModelFromPrisma & {
			primaryKey?: { fields?: string[] } | null;
		};

		// Utiliser le nom @@map si disponible, sinon le nom du modèle
		const realTableName = modelWithMeta.dbName || model.name;

		// Détecter les vues via plusieurs critères :
		// 1. Par convention de nommage (v_ ou _v_ ou contient "view")
		// 2. Par absence de clé primaire (@id ou @@id)
		const hasNamePattern =
			realTableName.startsWith('v_') ||
			realTableName.includes('_v_') ||
			model.name.toLowerCase().includes('view');

		const hasPrimaryKey =
			(modelWithMeta.primaryKey !== undefined && modelWithMeta.primaryKey !== null) ||
			model.fields.some((f) => f.isId);

		// Une vue = pas de clé primaire OU suit la convention de nommage
		const category: 'table' | 'view' = !hasPrimaryKey || hasNamePattern ? 'view' : 'table';

		// Utiliser le nom mappé (@@map) comme displayName par défaut
		let displayName = realTableName;
		const schema = modelWithMeta.schema || 'public';

		// Nettoyer uniquement les préfixes automatiques évidents (comme public_)
		// MAIS GARDER les vrais noms de tables qui contiennent le nom du schéma
		if (realTableName.startsWith('public_') && schema === 'public') {
			const cleanName = realTableName.substring(7); // 'public_'.length = 7
			displayName = cleanName;
		}

		// Extraire les informations sur les colonnes depuis le modèle DMMF
		const columns = model.fields
			.filter((f) => f.kind === 'scalar')
			.map((f) => ({
				name: f.name,
				type: f.type,
				isRequired: f.isRequired,
				isPrimaryKey: f.isId || false,
				isTimestamp:
					f.type === 'DateTime' &&
					/^(created_at|updated_at|deleted_at|timestamp|date_|.*_at)$/i.test(f.name),
				dbType: f.type
			}));

		return {
			name: model.name, // Garder le nom de modèle Prisma pour l'accès programmatique
			displayName, // Utiliser le nom @@map pour l'affichage
			category,
			database,
			schema,
			columns
		};
	});
	return tables;
}

// Obtenir toutes les tables des 3 bases (côté serveur uniquement)
export async function getAllDatabaseTables(): Promise<TableInfo[]> {
	if (browser) {
		throw new Error('[PRISMA-META] getAllDatabaseTables ne peut être appelé côté client');
	}

	const cenovTables = await getAllTables('cenov');
	const cenovDevTables = await getAllTables('cenov_dev');
	const cenovPreprodTables = await getAllTables('cenov_preprod');
	const allTables = [...cenovTables, ...cenovDevTables, ...cenovPreprodTables];

	// Tri uniforme : par database → par schéma → par type (tables avant vues) → par nom
	const sortedTables = allTables.toSorted((a, b) => {
		// Définir la priorité du type (table avant vue)
		const getTypeOrder = (category: 'table' | 'view') => (category === 'table' ? 1 : 2);

		// 1. Comparer par database (tri alphabétique)
		const databaseCompare = a.database.localeCompare(b.database);
		if (databaseCompare !== 0) {
			return databaseCompare;
		}

		// 2. Comparer par schéma dans la même database (tri alphabétique)
		const schemaCompare = a.schema.localeCompare(b.schema);
		if (schemaCompare !== 0) {
			return schemaCompare;
		}

		// 3. Comparer par type dans le même schéma (tables avant vues)
		const aTypeOrder = getTypeOrder(a.category);
		const bTypeOrder = getTypeOrder(b.category);
		if (aTypeOrder !== bTypeOrder) {
			return aTypeOrder - bTypeOrder;
		}

		// 4. Tri alphabétique par nom dans le même type
		return a.displayName.localeCompare(b.displayName);
	});

	return sortedTables;
}

// Obtenir tous les noms de bases de données
export async function getAllDatabaseNames(): Promise<DatabaseName[]> {
	if (browser) {
		return ['cenov', 'cenov_dev', 'cenov_preprod'];
	}

	const databases = await getDatabases();
	return Object.keys(databases) as DatabaseName[];
}

// Obtenir client Prisma (côté serveur uniquement)
export async function getClient(database: DatabaseName): Promise<Record<string, unknown>> {
	if (browser) {
		throw new Error('[PRISMA-META] getClient ne peut être appelé côté client');
	}

	const databases = await getDatabases();

	if (!databases[database]) {
		throw new Error(
			`[PRISMA-META] Database '${database}' not found in getClient. Available: ${Object.keys(databases).join(', ')}`
		);
	}

	if (!databases[database].client) {
		throw new Error(`[PRISMA-META] Client not found for database '${database}'`);
	}

	return databases[database].client;
}

// Compter lignes d'une table (côté serveur uniquement)
export async function countTableRows(database: DatabaseName, tableName: string): Promise<number> {
	if (browser) {
		throw new Error('[PRISMA-META] countTableRows ne peut être appelé côté client');
	}

	try {
		const client = await getClient(database);
		const model = client[tableName] as { count: () => Promise<number> } | undefined;
		return model ? await model.count() : 0;
	} catch {
		return 0;
	}
}

// ========== FONCTIONS POUR L'IMPORT ==========

// Fonction pour parser le format "database:tableName"
export function parseTableIdentifier(tableIdentifier: string): {
	database: DatabaseName;
	tableName: string;
} {
	const [database, tableName] = tableIdentifier.split(':');
	return { database: database as DatabaseName, tableName };
}

// Fonction pour détecter automatiquement la database d'une table via parser
export async function detectDatabaseForTable(tableIdentifier: string): Promise<DatabaseName> {
	if (browser) {
		throw new Error('[PRISMA-META] detectDatabaseForTable ne peut être appelé côté client');
	}

	// Parser le format "database:tableName" directement
	const { database } = parseTableIdentifier(tableIdentifier);
	return database;
}

// Types pour les règles de validation d'import
export interface ValidationRules {
	requiredFields: string[];
	uniqueFields: string[];
	validators: Record<string, (value: unknown) => boolean>;
}

// Obtenir les règles de validation pour une table via DMMF (côté serveur uniquement)
export async function getTableValidationRules(
	database: DatabaseName,
	tableName: string
): Promise<ValidationRules> {
	if (browser) {
		throw new Error('[PRISMA-META] getTableValidationRules ne peut être appelé côté client');
	}

	const metadata = await getTableMetadata(database, tableName);
	if (!metadata) {
		return {
			requiredFields: [],
			uniqueFields: [],
			validators: {}
		};
	}

	const databases = await getDatabases();
	const model = databases[database].dmmf.datamodel.models.find((m) => m.name === tableName);
	if (!model) {
		return {
			requiredFields: [],
			uniqueFields: [],
			validators: {}
		};
	}

	// Champs requis : détectés via isRequired et non isOptional du DMMF
	const requiredFields = metadata.fields
		.filter((field) => field.isRequired && !field.isPrimaryKey)
		.map((field) => field.name);

	// Champs uniques : détectés via les contraintes du DMMF
	const uniqueFields = getUniqueFieldsFromDMMF(model);

	// Validators : générés automatiquement selon les types Prisma
	const validators = generateValidatorsFromDMMF(metadata.fields);

	return {
		requiredFields,
		uniqueFields,
		validators
	};
}

// Fonction helper pour détecter les champs uniques via DMMF
function getUniqueFieldsFromDMMF(model: Record<string, unknown>): string[] {
	const uniqueFields: string[] = [];

	// 1. Champs avec @id
	const fields = model.fields as Array<{ name: string; isId?: boolean; isUnique?: boolean }>;
	if (fields) {
		const idFields = fields.filter((f) => f.isId);
		for (const field of idFields) {
			if (!uniqueFields.includes(field.name)) {
				uniqueFields.push(field.name);
			}
		}

		// 2. Champs avec @unique
		const uniqueSingleFields = fields.filter((f) => f.isUnique);
		for (const field of uniqueSingleFields) {
			if (!uniqueFields.includes(field.name)) {
				uniqueFields.push(field.name);
			}
		}
	}

	// 3. Contraintes composées @@unique et @@id
	const uniqueIndexes = model.uniqueIndexes as Array<{ fields?: string[] }> | undefined;
	if (uniqueIndexes) {
		for (const index of uniqueIndexes) {
			if (index.fields) {
				for (const fieldName of index.fields) {
					if (!uniqueFields.includes(fieldName)) {
						uniqueFields.push(fieldName);
					}
				}
			}
		}
	}

	// 4. Clé primaire composite @@id
	const primaryKey = model.primaryKey as { fields?: string[] } | undefined;
	if (primaryKey?.fields) {
		for (const fieldName of primaryKey.fields) {
			if (!uniqueFields.includes(fieldName)) {
				uniqueFields.push(fieldName);
			}
		}
	}

	return uniqueFields;
}

// Fonction helper pour générer les validators automatiquement
function generateValidatorsFromDMMF(
	fields: FieldInfo[]
): Record<string, (value: unknown) => boolean> {
	const validators: Record<string, (value: unknown) => boolean> = {};

	for (const field of fields) {
		validators[field.name] = createValidatorForField(field);
	}

	return validators;
}

// Créer un validator pour un champ selon son type DMMF
function createValidatorForField(field: FieldInfo): (value: unknown) => boolean {
	return (value: unknown) => {
		// Si champ optionnel et valeur vide, c'est valide
		if (!field.isRequired && (value === null || value === undefined || value === '')) {
			return true;
		}

		// Si champ requis et valeur vide, c'est invalide
		if (field.isRequired && (value === null || value === undefined || value === '')) {
			return false;
		}

		// Validation selon le type Prisma
		switch (field.type) {
			case 'String':
				if (typeof value !== 'string') return false;
				// Limite de longueur basée sur les conventions du projet
				return getStringLengthLimit(field.name, value);

			case 'Int':
			case 'BigInt': {
				const numValue = Number(value);
				return !Number.isNaN(numValue) && Number.isInteger(numValue);
			}

			case 'Float':
			case 'Decimal': {
				const floatValue = Number(value);
				return !Number.isNaN(floatValue);
			}

			case 'Boolean':
				return (
					typeof value === 'boolean' ||
					value === 'true' ||
					value === 'false' ||
					value === '1' ||
					value === '0'
				);

			case 'DateTime':
				if (value instanceof Date) return !Number.isNaN(value.getTime());
				if (typeof value === 'string') {
					const date = new Date(value);
					return !Number.isNaN(date.getTime());
				}
				return false;

			default:
				// Pour les types inconnus, accepter si c'est une string non vide
				return typeof value === 'string' && value.length > 0;
		}
	};
}

// Fonction helper pour les limites de longueur des strings (limite générique)
function getStringLengthLimit(fieldName: string, value: string): boolean {
	// Limite générique pour tous les champs string
	// Les contraintes spécifiques sont gérées par les validators Prisma DMMF
	return value.length <= 1000; // Limite raisonnable générale
}

// Obtenir toutes les tables importables (tables uniquement, pas les vues) (côté serveur uniquement)
export async function getImportableTables(): Promise<TableInfo[]> {
	if (browser) {
		throw new Error('[PRISMA-META] getImportableTables ne peut être appelé côté client');
	}

	const allTables = await getAllDatabaseTables();

	// Inclure uniquement les tables pour l'import (les vues sont exclues)
	const importableTables = allTables.filter((table) => table.category === 'table');

	// Ajouter le comptage des lignes comme dans l'export
	const tablesWithCounts = await Promise.all(
		importableTables.map(async (table) => {
			try {
				const count = await countTableRows(table.database, table.name);
				return {
					...table,
					rowCount: count
				};
			} catch {
				return {
					...table,
					rowCount: 0
				};
			}
		})
	);

	return tablesWithCounts;
}

// Obtenir les champs disponibles pour les tables importables (côté serveur uniquement)
export async function getImportableTableFields(): Promise<Record<string, string[]>> {
	if (browser) {
		throw new Error('[PRISMA-META] getImportableTableFields ne peut être appelé côté client');
	}

	const tables = await getImportableTables();
	const result: Record<string, string[]> = {};

	for (const table of tables) {
		const metadata = await getTableMetadata(table.database, table.name);
		if (metadata) {
			// Utiliser database:tableName comme clé pour éviter les collisions
			const key = `${table.database}:${table.name}`;
			result[key] = metadata.fields.map((field) => field.name);
		}
	}

	return result;
}

// Obtenir les champs requis pour les tables importables (côté serveur uniquement)
export async function getImportableTableRequiredFields(): Promise<Record<string, string[]>> {
	if (browser) {
		throw new Error(
			'[PRISMA-META] getImportableTableRequiredFields ne peut être appelé côté client'
		);
	}

	const tables = await getImportableTables();
	const result: Record<string, string[]> = {};

	for (const table of tables) {
		const validationRules = await getTableValidationRules(table.database, table.name);
		// Utiliser database:tableName comme clé pour éviter les collisions
		const key = `${table.database}:${table.name}`;
		result[key] = validationRules.requiredFields;
	}

	return result;
}

// ========== FONCTIONS CRUD GÉNÉRIQUES ==========

// Créer un enregistrement de manière générique (côté serveur uniquement)
export async function createRecord(
	database: DatabaseName,
	tableName: string,
	data: Record<string, unknown>
): Promise<Record<string, unknown>> {
	if (browser) {
		throw new Error('[PRISMA-META] createRecord ne peut être appelé côté client');
	}

	const client = await getClient(database);
	const model = client[tableName] as {
		create: (args: { data: unknown }) => Promise<Record<string, unknown>>;
	};

	if (!model?.create) {
		throw new Error(`Table ${tableName} not found in database ${database}`);
	}

	return await model.create({ data });
}

// Mettre à jour un enregistrement de manière générique (côté serveur uniquement)
export async function updateRecord(
	database: DatabaseName,
	tableName: string,
	where: Record<string, unknown>,
	data: Record<string, unknown>
): Promise<{ count: number }> {
	if (browser) {
		throw new Error('[PRISMA-META] updateRecord ne peut être appelé côté client');
	}

	const client = await getClient(database);
	const model = client[tableName] as {
		updateMany: (args: { where: unknown; data: unknown }) => Promise<{ count: number }>;
	};

	if (!model?.updateMany) {
		throw new Error(`Table ${tableName} not found in database ${database}`);
	}

	return await model.updateMany({ where, data });
}

// Trouver un enregistrement de manière générique (côté serveur uniquement)
export async function findRecord(
	database: DatabaseName,
	tableName: string,
	where: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
	if (browser) {
		throw new Error('[PRISMA-META] findRecord ne peut être appelé côté client');
	}

	const client = await getClient(database);
	const model = client[tableName] as {
		findFirst: (args: { where: unknown }) => Promise<Record<string, unknown> | null>;
	};

	if (!model?.findFirst) {
		throw new Error(`Table ${tableName} not found in database ${database}`);
	}

	return await model.findFirst({ where });
}
