# Plan d'Implémentation Pino Logger

## 📋 Vue d'Ensemble

**Objectif :** Remplacer les 150+ `console.log/error/warn` par un système de logging structuré et performant avec Pino + Pino-Pretty.

**Analyse Codebase :**
- **150 console.* à remplacer** (console.log, error, warn)
- **19 fichiers** avec logging ad-hoc
- **Patterns actuels :** Emojis + préfixes (`[EXPORT]`, `[FETCH]`) - inconsistants
- **Fichiers prioritaires :** CRUD/+page.svelte (54 logs), Form.svelte (17 logs), routes API (30+ logs)

---

## ⚖️ Avantages vs Inconvénients: Pino vs console.log Actuel

### ✅ Avantages de Pino

| Aspect | console.log Actuel | Pino | Gain |
|--------|-------------------|------|------|
| **Performance** | Bloquant (sync) | Async non-bloquant | **5x plus rapide** |
| **Structure** | Texte non structuré | JSON structuré | Parsable par IA/outils |
| **Niveaux** | Tous niveaux mélangés | debug/info/warn/error/fatal | Filtrage précis |
| **Environnement** | Mêmes logs dev/prod | Pretty dev, JSON prod | Adapté à chaque env |
| **Contexte** | Préfixes manuels `[EXPORT]` | Child loggers automatiques | Moins d'erreurs |
| **Traçabilité** | Aucune (sauf debug-fetch) | Request ID automatique | Suivi end-to-end |
| **Parsing IA** | ❌ Difficile | ✅ Facile (JSON) | **Critique pour Claude** |
| **Recherche** | grep texte brut | Recherche structurée | Requêtes complexes |
| **Production** | Logs verbeux partout | Filtrage par niveau | Moins de bruit |
| **Timestamp** | ❌ Absent | ✅ ISO 8601 précis | Debugging temporel |

### ❌ Inconvénients de Pino

| Inconvénient | Impact | Mitigation |
|--------------|--------|------------|
| **Dépendance externe** | +2 packages (pino, pino-pretty) | Pino = 15M téléchargements/semaine (très stable) |
| **Courbe apprentissage** | Nouvelle syntaxe à apprendre | Syntaxe simple: `logger.info({ ctx }, 'msg')` |
| **Refactoring** | 150 logs à modifier | Refacto progressive par priorité (API → utils → composants) |
| **Temps implémentation** | ~50 minutes | Gain long-terme >> coût initial |
| **Output dev** | JSON moins lisible | **pino-pretty résout ça** (colorisé) |
| **Import côté client** | Erreur si importé dans Svelte | Convention claire: `$lib/server/logger.ts` |

### 🎯 Avantages Spécifiques pour Votre Projet

1. **IA/Claude Code Friendly** ⭐
   - JSON structuré → parsing automatique facile
   - Context extraction: `requestId`, `module`, `duration`
   - Recherche: "Trouve tous les logs d'erreur pour requestId X"

2. **Debugging Production**
   - Request ID → trace requête complète (hooks → route → DB → response)
   - Filtrage par niveau → voir uniquement erreurs/warnings
   - Timing automatique → identifier bottlenecks

3. **Multi-Database Support**
   - Child loggers: `logger.child({ database: 'cenov_dev' })`
   - Filtrage par base automatique
   - Contexte préservé dans tous les logs

4. **Performance Critique**
   - Import orchestrator: 19 logs par import → async = pas de ralentissement
   - Export: logs multiples par table → pas de blocage I/O

5. **Professionnalisme**
   - Logs production-ready (pas de console.log en prod)
   - Format standardisé (ISO timestamps, JSON)
   - Compatible outils monitoring (Elasticsearch, Datadog, etc.)

### 📊 Comparaison Logs Réels

**Avant (console.log) :**
```typescript
console.log(`🔍 Génération template pour catégorie: ${cat_code} (base: ${database})`);
console.log(`✅ Trouvé ${hierarchies.length} hiérarchies`);
console.error('❌ Erreur:', error);
```

**Output dev :**
```
🔍 Génération template pour catégorie: CAT001 (base: cenov_dev)
✅ Trouvé 12 hiérarchies
❌ Erreur: Error: Database connection failed
```

**Problèmes :**
- ❌ Pas de timestamp
- ❌ Pas de request ID (impossible de tracer)
- ❌ Impossible de filtrer par niveau
- ❌ Parsing difficile pour IA
- ❌ Même output en prod (verbeux)

**Après (Pino) :**
```typescript
logger.info({ requestId, cat_code, database }, 'Template generation started');
logger.debug({ requestId, count: hierarchies.length }, 'Hierarchies loaded');
logger.error({ requestId, error: error.message, stack: error.stack }, 'Template generation failed');
```

**Output dev (pino-pretty) :**
```
[12:34:56] INFO  [importV2] Template generation started
    requestId: "abc-123"
    cat_code: "CAT001"
    database: "cenov_dev"
[12:34:57] DEBUG [importV2] Hierarchies loaded
    requestId: "abc-123"
    count: 12
[12:34:58] ERROR [importV2] Template generation failed
    requestId: "abc-123"
    error: "Database connection failed"
    stack: "Error: Database connection..."
```

**Output prod (JSON) :**
```json
{"level":"info","time":"2025-12-22T12:34:56.789Z","module":"importV2","requestId":"abc-123","cat_code":"CAT001","database":"cenov_dev","msg":"Template generation started"}
{"level":"debug","time":"2025-12-22T12:34:57.012Z","module":"importV2","requestId":"abc-123","count":12,"msg":"Hierarchies loaded"}
{"level":"error","time":"2025-12-22T12:34:58.234Z","module":"importV2","requestId":"abc-123","error":"Database connection failed","stack":"Error: Database...","msg":"Template generation failed"}
```

**Avantages :**
- ✅ Timestamp précis (ISO 8601)
- ✅ Request ID pour traçage complet
- ✅ Filtrage: `LOG_LEVEL=error` → voir uniquement erreurs
- ✅ Parsing facile: `jq '.requestId == "abc-123"' logs.json`
- ✅ Pretty dev, structuré prod

### 🚀 ROI (Return on Investment)

**Coût Initial :**
- 2 minutes: Installation pino + pino-pretty
- 10 minutes: Setup logger + config
- 30 minutes: Refacto API routes (priorité haute)
- 10 minutes: Tests
- **Total: ~50 minutes**

**Gains Long-Terme :**
- ⏱️ **Debugging 3-5x plus rapide** (request ID tracking, filtrage)
- 🤖 **IA-friendly** (Claude peut parser/analyser logs automatiquement)
- 🐛 **Moins de bugs en prod** (logs structurés = meilleure observabilité)
- 📈 **Scalabilité** (performance async, compatible monitoring tools)
- 🧹 **Code plus propre** (suppression 70+ logs debug inutiles Svelte)

**Verdict :** **ROI positif dès la première semaine**

---

## 🔧 Phase 1 : Installation Dépendances

### 1.1 Installer Pino et Pino-Pretty

```bash
pnpm add pino
pnpm add -D pino-pretty
```

**Packages :**
- `pino` - Logger principal (production + dev)
- `pino-pretty` - Formatter pour dev (dev dependency uniquement)

### 1.2 Vérifier Installation

```bash
pnpm list pino pino-pretty
```

---

## 📁 Phase 2 : Création Fichiers Logger et Documentation

### 2.0 Créer Documentation `docs/PINO_LOGGER.md`

**Chemin :** `docs/PINO_LOGGER.md` (documentation projet)

**Contenu :** Copie de ce plan d'implémentation pour référence future

**Pourquoi :**
- Documentation centralisée dans le projet
- Référence pour toute l'équipe
- Guide pour maintenir/étendre le système de logging

### 2.1 Créer `src/lib/server/logger.ts`

**Chemin :** `src/lib/server/logger.ts` (suit pattern existant `db.ts`, `env.ts`)

**Contenu :**

```typescript
/**
 * Pino Logger Configuration
 *
 * Logging centralisé pour l'application SvelteKit
 * - Dev: Pretty print colorisé, niveau debug
 * - Prod: JSON structuré, niveau info
 *
 * @example
 * import { logger } from '$lib/server/logger';
 *
 * logger.info({ userId: 123 }, 'User logged in');
 * logger.error({ error }, 'Database error');
 *
 * const childLogger = logger.child({ module: 'export' });
 * childLogger.debug({ tableId: 'kit' }, 'Exporting table');
 */

import pino from 'pino';
import { dev } from '$app/environment';
import { env } from './env';

// Configuration transport conditionnel (pino-pretty en dev uniquement)
const transport = dev
	? {
			target: 'pino-pretty',
			options: {
				colorize: true,
				translateTime: 'SYS:HH:MM:ss',
				ignore: 'pid,hostname',
				singleLine: false,
				messageFormat: '{levelLabel} [{module}] {msg}'
			}
		}
	: undefined;

// Créer instance singleton logger
export const logger = pino({
	level: env.LOG_LEVEL || (dev ? 'debug' : 'info'),
	transport: transport ? { transport } : undefined,
	timestamp: pino.stdTimeFunctions.isoTime,
	base: {
		env: dev ? 'development' : 'production'
	},
	formatters: {
		level: (label) => {
			return { level: label };
		}
	}
});

// Helper pour créer child loggers avec contexte
export function createChildLogger(module: string) {
	return logger.child({ module });
}

// Export types pour TypeScript
export type Logger = typeof logger;
```

**Pourquoi ce fichier :**
- Suit pattern singleton de `db.ts`
- Dans `src/lib/server/` → jamais exposé au client
- Configuration centralisée env-aware
- TypeScript natif

### 2.2 Créer Types TypeScript (RECOMMANDÉ)

**Chemin :** `src/lib/server/logger.types.ts`

**Pourquoi créer des types :**
- ✅ **Autocomplétion IDE** - Suggestions contextuelles
- ✅ **Type safety** - Détection erreurs compilation
- ✅ **Documentation inline** - Types = documentation
- ✅ **Réutilisabilité** - Interfaces partagées
- ✅ **IA-friendly** - Claude comprend mieux le contexte structuré

**Avantages spécifiques :**

1. **Autocomplétion contextuelle :**
   ```typescript
   // Sans types
   logger.info({ requestId, userId }, 'User action'); // Pas de suggestion

   // Avec types
   logger.info<LogContext>({
     requestId, // ✅ Suggéré
     userId,    // ✅ Suggéré
     database,  // ✅ Suggéré avec valeurs possibles
     |          // ← IDE propose les autres champs
   }, 'User action');
   ```

2. **Détection erreurs :**
   ```typescript
   // Sans types
   logger.error({ databse: 'cenov' }, 'Error'); // ❌ Typo non détectée

   // Avec types
   logger.error<ErrorLogContext>({
     databse: 'cenov' // ❌ Erreur TypeScript: "databse" n'existe pas
   }, 'Error');
   ```

3. **Standardisation contexte :**
   ```typescript
   // Force l'utilisation de contexte cohérent
   const logCtx: LogContext = {
     requestId,
     database: 'cenov_dev', // ✅ Valeur validée (literal type)
     module: 'export'
   };
   logger.info(logCtx, 'Export started');
   ```

**Inconvénients (mineurs) :**
- ❌ +1 fichier à maintenir
- ❌ Cast explicite parfois nécessaire: `logger.info<LogContext>(...)`
- ❌ Overhead initial: définir les interfaces

**Verdict :** **FORTEMENT RECOMMANDÉ** (avantages >> inconvénients)

**Contenu complet :**

```typescript
/**
 * Types pour logging contextualisé avec Pino
 *
 * Ces types fournissent autocomplétion et type safety pour les logs
 *
 * @example
 * import type { LogContext, ErrorLogContext } from './logger.types';
 *
 * const ctx: LogContext = { requestId, module: 'export', database: 'cenov_dev' };
 * logger.info(ctx, 'Export started');
 */

/**
 * Contexte de base pour tous les logs
 */
export interface LogContext {
	/** ID unique de la requête HTTP (généré dans hooks.server.ts) */
	requestId?: string;

	/** ID utilisateur (si authentifié) */
	userId?: string;

	/** Base de données utilisée */
	database?: 'cenov' | 'cenov_dev' | 'cenov_preprod';

	/** Module/feature concerné (export, import, wordpress, etc.) */
	module?: string;

	/** Opération spécifique (create, update, delete, etc.) */
	operation?: string;

	/** Durée d'exécution en millisecondes */
	duration?: number;

	/** Permettre champs additionnels */
	[key: string]: unknown;
}

/**
 * Contexte spécifique pour logs d'erreur
 */
export interface ErrorLogContext extends LogContext {
	/** Message d'erreur ou objet Error */
	error: Error | string | unknown;

	/** Stack trace (si Error) */
	stack?: string;

	/** Code HTTP (si erreur HTTP) */
	statusCode?: number;
}

/**
 * Contexte pour logs de performance
 */
export interface PerformanceLogContext extends LogContext {
	/** Durée requise (ms) */
	duration: number;

	/** Métriques additionnelles */
	metrics?: {
		queryCount?: number;
		rowsAffected?: number;
		memoryUsed?: number;
		[key: string]: unknown;
	};
}

/**
 * Contexte pour logs de base de données
 */
export interface DatabaseLogContext extends LogContext {
	/** Base de données (requis pour ce contexte) */
	database: 'cenov' | 'cenov_dev' | 'cenov_preprod';

	/** Table concernée */
	table?: string;

	/** ID de l'entité */
	entityId?: string | number;

	/** Nombre de lignes affectées */
	rowCount?: number;
}

/**
 * Contexte pour logs d'import/export
 */
export interface ImportExportLogContext extends DatabaseLogContext {
	/** Type d'opération */
	operation: 'import' | 'export';

	/** Nombre de lignes traitées */
	rowCount: number;

	/** Fichier source/destination */
	filename?: string;

	/** Format (csv, json, xlsx, etc.) */
	format?: string;
}
```

**Utilisation avec les types :**

```typescript
import { createChildLogger } from '$lib/server/logger';
import type { ImportExportLogContext, ErrorLogContext } from '$lib/server/logger.types';

const logger = createChildLogger('export');

export const actions = {
	export: async ({ request, locals }) => {
		const { requestId } = locals;
		const startTime = Date.now();

		// ✅ Type safety + autocomplétion
		const ctx: ImportExportLogContext = {
			requestId,
			database: 'cenov_dev', // ✅ IDE suggère uniquement les 3 valeurs valides
			operation: 'export',
			rowCount: 0,
			format: 'csv'
		};

		logger.info(ctx, 'Export started');

		try {
			// ... export logic
			ctx.rowCount = exportedRows.length;
			ctx.duration = Date.now() - startTime;

			logger.info(ctx, 'Export completed');
		} catch (error) {
			// ✅ Type spécifique pour erreurs
			const errorCtx: ErrorLogContext = {
				...ctx,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined
			};

			logger.error(errorCtx, 'Export failed');
		}
	}
};
```

---

## ⚙️ Phase 3 : Configuration Environnement

### 3.1 Ajouter Variable `LOG_LEVEL` dans `.env`

**Fichier :** `.env`

```env
# Logging Configuration
LOG_LEVEL=debug  # dev: debug | prod: info, warn, error
```

### 3.2 Valider avec Zod dans `src/lib/server/env.ts`

**Fichier :** `src/lib/server/env.ts`

**Modification :** Ajouter dans le schéma `serverSchema` :

```typescript
import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod/v4';

export const env = createEnv({
	server: {
		// ... existing variables ...

		// Logging
		LOG_LEVEL: z
			.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
			.default('info')
			.describe('Niveau de log (trace < debug < info < warn < error < fatal)')
	},
	runtimeEnv: process.env
});
```

**Validation :** Si `LOG_LEVEL` est invalide ou absent → utilise `'info'` par défaut.

---

## 🔌 Phase 4 : Intégration Globale

### 4.1 Intégrer dans `src/hooks.server.ts`

**Fichier :** `src/hooks.server.ts`

**Modifications :**

```typescript
import type { Handle } from '@sveltejs/kit';
import { handleLogto } from '@logto/sveltekit';
import { env } from '$lib/server/env';
import { logger } from '$lib/server/logger'; // ← AJOUTER

export const handle: Handle = async ({ event, resolve }) => {
	// Générer Request ID pour traçabilité
	const requestId = event.request.headers.get('x-request-id') || crypto.randomUUID();

	// Stocker dans locals pour accès dans routes
	event.locals.requestId = requestId;

	// Log requête entrante
	logger.info(
		{
			requestId,
			method: event.request.method,
			path: event.url.pathname,
			userAgent: event.request.headers.get('user-agent')
		},
		'Incoming request'
	);

	try {
		const logtoHandle = handleLogto(
			{
				endpoint: env.SECRET_LOGTO_ENDPOINT,
				appId: env.SECRET_LOGTO_APP_ID,
				appSecret: env.SECRET_LOGTO_APP_SECRET,
				encryptionKey: env.SECRET_LOGTO_COOKIE_ENCRYPTION_KEY
			},
			{
				signInUrl: '/sign-in',
				signOutUrl: '/',
				signUpUrl: '/sign-up',
				afterSignInUrl: '/',
				afterSignOutUrl: '/'
			}
		);

		const response = await logtoHandle({ event, resolve });

		// Log succès requête
		logger.info(
			{ requestId, status: response.status },
			'Request completed'
		);

		return response;
	} catch (error) {
		// Remplacer console.error par logger
		logger.error(
			{
				requestId,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined
			},
			'Handle error'
		);
		throw error;
	}
};
```

**Ajout TypeScript :** Typer `event.locals` dans `src/app.d.ts` :

```typescript
// src/app.d.ts
declare global {
	namespace App {
		interface Locals {
			requestId: string;
			// ... existing locals ...
		}
	}
}
```

### 4.2 Intégrer dans `src/lib/server/db.ts` (Prisma)

**Fichier :** `src/lib/server/db.ts`

**Modifications :**

```typescript
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { Pool } from '@neondatabase/serverless';
import { env } from './env';
import { logger } from './logger'; // ← AJOUTER

const pool = new Pool({ connectionString: env.DATABASE_URL });
const adapter = new PrismaNeon(pool);

logger.info('Initializing Prisma client for CENOV database'); // ← AJOUTER

const prisma = new PrismaClient({
	adapter,
	log: [
		{ emit: 'event', level: 'error' },
		{ emit: 'event', level: 'warn' }
	],
	errorFormat: 'pretty'
});

// Logger les événements Prisma
prisma.$on('error', (e) => {
	logger.error({ prismaError: e }, 'Prisma error event');
});

prisma.$on('warn', (e) => {
	logger.warn({ prismaWarning: e }, 'Prisma warning event');
});

export { prisma };
```

---

## 🔄 Phase 5 : Refactorisation Progressive (Par Priorité)

### 5.1 Priorité 1 - Routes API Serveur (30+ logs)

**Fichiers à refactoriser :**

#### A. `src/routes/importV2/+server.ts` (7 logs)

**Pattern actuel :**
```typescript
console.log(`🔍 Génération template pour catégorie: ${cat_code}`);
console.log(`✅ Trouvé ${hierarchies.length} hiérarchies`);
console.error('❌ Erreur:', error);
```

**Pattern Pino :**
```typescript
import { createChildLogger } from '$lib/server/logger';

const logger = createChildLogger('importV2');

export const GET: RequestHandler = async ({ url, locals }) => {
	const { requestId } = locals;
	const cat_code = url.searchParams.get('cat_code');

	logger.info({ requestId, cat_code, database }, 'Template generation started');

	try {
		const category = await prisma.category.findFirst({ ... });
		logger.debug({ requestId, categoryId: category.cat_id }, 'Category found');

		const hierarchies = await prisma.category.findMany({ ... });
		logger.info({ requestId, count: hierarchies.length }, 'Hierarchies loaded');

		// ... rest of logic

		logger.info({ requestId, rowCount: csvData.length }, 'Template generated successfully');
		return new Response(csv, { ... });
	} catch (error) {
		logger.error(
			{
				requestId,
				cat_code,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined
			},
			'Template generation failed'
		);
		throw error;
	}
};
```

#### B. `src/routes/wordpress/+server.ts` (13 logs)

**Pattern actuel :**
```typescript
console.log('🟢 1. Vérification authentification WordPress...');
console.log('🔐 2. Authentification validée, récupération produits...');
console.error('❌ Erreur génération CSV:', error);
```

**Pattern Pino :**
```typescript
import { createChildLogger } from '$lib/server/logger';

const logger = createChildLogger('wordpress');

export const POST: RequestHandler = async ({ request, locals }) => {
	const { requestId } = locals;

	logger.info({ requestId }, 'WordPress export started');

	try {
		const body = await request.json();
		logger.debug({ requestId, credentials: '***' }, 'Authentication received');

		// Validation auth
		logger.info({ requestId }, 'Authentication validated');

		const products = await prisma.product.findMany({ ... });
		logger.info({ requestId, productCount: products.length }, 'Products retrieved');

		// Génération CSV
		logger.debug({ requestId, rowCount: csvData.length }, 'CSV generated');

		logger.info({ requestId, fileSize: csv.length }, 'WordPress export completed');
		return json({ csv });
	} catch (error) {
		logger.error(
			{ requestId, error: error instanceof Error ? error.message : String(error) },
			'WordPress export failed'
		);
		return json({ error: 'Export failed' }, { status: 500 });
	}
};
```

#### C. `src/routes/export/+page.server.ts` (6 logs)

**Pattern actuel :**
```typescript
console.error('❌ [EXPORT] Erreur lors de:', err);
```

**Pattern Pino :**
```typescript
import { createChildLogger } from '$lib/server/logger';

const logger = createChildLogger('export');

export const load = async ({ locals }) => {
	const { requestId } = locals;

	logger.info({ requestId }, 'Export page load');

	try {
		const tables = await getAllDatabaseTables();
		logger.debug({ requestId, tableCount: tables.length }, 'Tables loaded');
		return { tables };
	} catch (error) {
		logger.error({ requestId, error }, 'Failed to load tables');
		throw error;
	}
};

export const actions = {
	export: async ({ request, locals }) => {
		const { requestId } = locals;
		const formData = await request.formData();

		logger.info({ requestId, tables: formData.getAll('tables') }, 'Export started');

		try {
			// Export logic...
			logger.info({ requestId, duration: Date.now() - start }, 'Export completed');
			return { success: true };
		} catch (error) {
			logger.error(
				{
					requestId,
					error: error instanceof Error ? error.message : String(error),
					stack: error instanceof Error ? error.stack : undefined
				},
				'Export failed'
			);
			return fail(500, { error: 'Export failed' });
		}
	}
};
```

### 5.2 Priorité 2 - Utilitaires Serveur (10+ logs)

#### A. `src/lib/prisma-meta.ts` (4 logs)

**Lignes à modifier :**
- Ligne 85, 111 : `console.warn()` → `logger.warn()`
- Ligne 232 : `console.log()` → `logger.info()`
- Ligne 234 : `console.warn()` → `logger.warn()`

**Pattern :**
```typescript
import { logger } from '$lib/server/logger';

// Ligne 85
logger.warn({ client: 'cenov_dev' }, 'Client initialization warning');

// Ligne 232
logger.info({ projectRoot }, '[PRISMA-META] Schemas loaded successfully');

// Ligne 234
logger.warn({ projectRoot, error }, '[PRISMA-META] Schema read error');
```

#### B. `src/routes/importV2/services/import.orchestrator.ts` (19 logs)

**Pattern actuel :**
```typescript
console.log('📦 Création fournisseur:', supplierData);
console.log('💰 Création prix achat:', priceData);
```

**Pattern Pino :**
```typescript
import { createChildLogger } from '$lib/server/logger';

const logger = createChildLogger('import-orchestrator');

export async function orchestrateImport(data: ImportData, requestId: string) {
	logger.info({ requestId, rowCount: data.length }, 'Import orchestration started');

	try {
		// Supplier
		const supplier = await createSupplier(supplierData);
		logger.debug({ requestId, supplierId: supplier.sup_id }, 'Supplier created');

		// Kit
		const kit = await createKit(kitData);
		logger.debug({ requestId, kitId: kit.kit_id }, 'Kit created');

		// Products (bulk)
		const products = await createProducts(productData);
		logger.info({ requestId, productCount: products.length }, 'Products created');

		logger.info({ requestId, duration: Date.now() - start }, 'Import completed successfully');
		return { success: true, count: products.length };
	} catch (error) {
		logger.error(
			{ requestId, error: error instanceof Error ? error.message : String(error) },
			'Import orchestration failed'
		);
		throw error;
	}
}
```

### 5.3 Priorité 3 - Composants Svelte (Cleanup, 70+ logs)

**⚠️ Note :** Les composants Svelte sont côté client → **NE PAS utiliser logger serveur**.

**Stratégie :**
1. **Supprimer** les logs de debug excessifs (Form.svelte - 17 logs, CRUD - 54 logs)
2. **Remplacer** par réactivité Svelte 5 (`$derived`, `$effect`)
3. **Garder uniquement** les logs d'erreur critiques (console.error)

**Exemple :** `src/routes/CRUD/+page.svelte` (54 logs → 5 logs)

**Avant :**
```svelte
<script lang="ts">
	console.log('Changement isOpen:', isOpen);
	console.log('FormData mis à jour:', formData);
	console.log('Ouverture formulaire édition');
	console.log('Fermeture formulaire');
	// ... 50 autres logs
</script>
```

**Après :**
```svelte
<script lang="ts">
	// Supprimer tous les console.log de debug

	// Garder uniquement les erreurs critiques
	catch (error) {
		console.error('Failed to submit form:', error);
		toast.error('Erreur lors de la soumission');
	}
</script>
```

**Fichiers à nettoyer :**
- `src/routes/CRUD/+page.svelte` - 54 logs → ~5 logs
- `src/lib/components/Form.svelte` - 17 logs → ~2 logs
- `src/routes/export/+page.svelte` - 10 logs → ~3 logs

### 5.4 Priorité 4 - Utilitaires Client (debug-fetch.ts)

**Fichier :** `src/lib/utils/debug-fetch.ts`

**⚠️ Ce fichier est côté client** → Conserver pattern console actuel **OU** créer logger client léger.

**Option 1 (Recommandée) :** Garder console.log avec pattern actuel (déjà excellent)

**Option 2 (Avancée) :** Créer `src/lib/logger-client.ts` pour uniformiser :

```typescript
/**
 * Client-side logger (browser console wrapper)
 * Simple wrapper pour uniformiser logs client
 */

export const clientLogger = {
	debug: (context: Record<string, unknown>, message: string) => {
		if (import.meta.env.DEV) {
			console.debug(`[${context.module || 'CLIENT'}]`, message, context);
		}
	},
	info: (context: Record<string, unknown>, message: string) => {
		console.info(`[${context.module || 'CLIENT'}]`, message, context);
	},
	warn: (context: Record<string, unknown>, message: string) => {
		console.warn(`[${context.module || 'CLIENT'}]`, message, context);
	},
	error: (context: Record<string, unknown>, message: string) => {
		console.error(`[${context.module || 'CLIENT'}]`, message, context);
	}
};
```

---

## ✅ Phase 6 : Tests et Validation

### 6.1 Test Développement

**Commandes :**
```bash
pnpm dev
```

**Vérifications :**
1. ✅ Logs apparaissent en **couleur** (pino-pretty actif)
2. ✅ Format : `INFO [module] message { context }`
3. ✅ Request ID présent dans les logs de requêtes
4. ✅ Niveaux de log respectés (debug visible en dev)

**Exemple output attendu :**
```
INFO [12:34:56] [export] Export started { requestId: "abc-123", tables: ["kit", "product"] }
DEBUG [12:34:57] [export] Tables loaded { requestId: "abc-123", tableCount: 15 }
INFO [12:34:58] [export] Export completed { requestId: "abc-123", duration: 1234 }
```

### 6.2 Test Production (Simulation)

**Commandes :**
```bash
LOG_LEVEL=info pnpm build
pnpm preview
```

**Vérifications :**
1. ✅ Logs en format **JSON** (pas de pretty print)
2. ✅ Uniquement logs `info` et supérieurs (pas de `debug`)
3. ✅ Logs parsables par outils externes (jq, Elasticsearch, etc.)

**Exemple output attendu :**
```json
{"level":"info","time":"2025-12-22T12:34:56.789Z","module":"export","requestId":"abc-123","msg":"Export started","tables":["kit","product"]}
{"level":"info","time":"2025-12-22T12:34:58.012Z","module":"export","requestId":"abc-123","msg":"Export completed","duration":1234}
```

### 6.3 Test Parsing JSON (pour IA/Claude Code)

**Commande :**
```bash
node -e "const logs = require('fs').readFileSync('logs.json', 'utf8').split('\n').filter(Boolean).map(JSON.parse); console.log(logs.filter(l => l.level === 'error'));"
```

**Vérifications :**
1. ✅ Logs JSON valides (parsable)
2. ✅ Filtrage par niveau possible
3. ✅ Extraction contexte structuré (requestId, module, etc.)

### 6.4 Test Niveaux de Log

**Test changement niveau :**
```bash
# Dev - Voir tous les logs
LOG_LEVEL=debug pnpm dev

# Prod - Voir uniquement info+
LOG_LEVEL=info pnpm dev

# Critical only
LOG_LEVEL=error pnpm dev
```

**Vérifications :**
1. ✅ `debug` : Tous logs visibles
2. ✅ `info` : Uniquement info/warn/error/fatal
3. ✅ `error` : Uniquement error/fatal

---

## 📊 Résumé des Fichiers

### Fichiers à Créer (3)

1. **`docs/PINO_LOGGER.md`** - Documentation complète du système de logging
2. **`src/lib/server/logger.ts`** - Logger principal Pino
3. **`src/lib/server/logger.types.ts`** - Types TypeScript (RECOMMANDÉ)

### Fichiers à Modifier (10+)

**Configuration :**
1. **`.env`** - Ajouter `LOG_LEVEL=debug`
2. **`src/lib/server/env.ts`** - Valider `LOG_LEVEL` avec Zod
3. **`src/app.d.ts`** - Typer `locals.requestId`

**Intégration Globale :**
4. **`src/hooks.server.ts`** - Request logging + Request ID
5. **`src/lib/server/db.ts`** - Prisma event logging

**Routes API (Priorité 1) :**
6. **`src/routes/importV2/+server.ts`** - 7 logs
7. **`src/routes/wordpress/+server.ts`** - 13 logs
8. **`src/routes/export/+page.server.ts`** - 6 logs

**Utilitaires (Priorité 2) :**
9. **`src/lib/prisma-meta.ts`** - 4 logs
10. **`src/routes/importV2/services/import.orchestrator.ts`** - 19 logs

**Composants Svelte (Priorité 3 - Cleanup) :**
11. **`src/routes/CRUD/+page.svelte`** - Supprimer 50+ logs
12. **`src/lib/components/Form.svelte`** - Supprimer 15+ logs
13. **`src/routes/export/+page.svelte`** - Supprimer 7+ logs

### Dépendances à Installer (2)

```bash
pnpm add pino
pnpm add -D pino-pretty
```

---

## 🎯 Ordre d'Exécution Recommandé

1. **Installation** (2 min)
   - Installer pino + pino-pretty

2. **Configuration** (5 min)
   - Créer logger.ts
   - Ajouter LOG_LEVEL dans .env et env.ts
   - Typer app.d.ts

3. **Intégration Globale** (5 min)
   - Modifier hooks.server.ts
   - Modifier db.ts

4. **Refacto Routes API** (15 min)
   - importV2/+server.ts
   - wordpress/+server.ts
   - export/+page.server.ts

5. **Refacto Utilitaires** (10 min)
   - prisma-meta.ts
   - import.orchestrator.ts

6. **Cleanup Composants** (10 min)
   - CRUD/+page.svelte
   - Form.svelte
   - export/+page.svelte

7. **Tests** (5 min)
   - Test dev (pretty print)
   - Test prod (JSON)
   - Vérifier niveaux de log

**Temps total estimé : ~50 minutes**

---

## 🔍 Points de Vigilance

1. **Chemins Windows absolus** - Utiliser backslashes pour tous fichiers
2. **Logger uniquement côté serveur** - Ne pas importer dans composants Svelte
3. **Request ID** - Passer `locals.requestId` dans tous les logs de routes
4. **Child loggers** - Utiliser `createChildLogger(module)` pour contexte automatique
5. **Secrets masking** - Jamais logger mots de passe/tokens (utiliser `'***'`)
6. **Performance** - Pino est async, pas de blocage I/O
7. **Structured data** - Toujours passer objets en 1er param, message en 2ème

---

## 📚 Documentation Références

- [Pino Documentation](https://getpino.io/)
- [Pino-Pretty GitHub](https://github.com/pinojs/pino-pretty)
- [SvelteKit + Pino Guide](https://medium.com/@adredars/logging-in-sveltekit-using-pino-and-svelte-stores-f63bf6251f2c)
- [Best Node.js Logging Libraries 2025](https://betterstack.com/community/guides/logging/best-nodejs-logging-libraries/)

---

## ✨ Exemple d'Utilisation Finale

```typescript
// Route API avec logger
import { createChildLogger } from '$lib/server/logger';

const logger = createChildLogger('my-api');

export const POST: RequestHandler = async ({ request, locals }) => {
	const { requestId } = locals;
	const startTime = Date.now();

	logger.info({ requestId }, 'API call started');

	try {
		const body = await request.json();
		logger.debug({ requestId, bodyKeys: Object.keys(body) }, 'Request body received');

		const result = await processData(body);
		logger.info(
			{ requestId, resultCount: result.length, duration: Date.now() - startTime },
			'API call completed'
		);

		return json({ success: true, data: result });
	} catch (error) {
		logger.error(
			{
				requestId,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				duration: Date.now() - startTime
			},
			'API call failed'
		);
		return json({ success: false, error: 'Processing failed' }, { status: 500 });
	}
};
```

**Output Dev :**
```
INFO [12:34:56] [my-api] API call started { requestId: "abc-123" }
DEBUG [12:34:56] [my-api] Request body received { requestId: "abc-123", bodyKeys: ["name", "email"] }
INFO [12:34:57] [my-api] API call completed { requestId: "abc-123", resultCount: 5, duration: 1234 }
```

**Output Prod :**
```json
{"level":"info","time":"2025-12-22T12:34:56.789Z","module":"my-api","requestId":"abc-123","msg":"API call started"}
{"level":"info","time":"2025-12-22T12:34:57.012Z","module":"my-api","requestId":"abc-123","resultCount":5,"duration":1234,"msg":"API call completed"}
```

---

**Fin du Plan** 🎉
