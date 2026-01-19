# CLAUDE.md - Version Condensée

## ⚙️ Stack Technique

- **Frontend:** SvelteKit + TypeScript (Svelte 5 - `$state`, `$derived`, `$effect`, `$props`)
- **Base de données:** PostgreSQL + Prisma ORM (3 bases: CENOV, CENOV_DEV, CENOV_PREPROD)
- **Styles:** TailwindCSS + Flowbite + Shadcn Svelte
- **Auth:** Logto
- **Validation:** Zod 4 + SvelteKit Superforms
- **Package Manager:** pnpm

## 🚀 Commandes Essentielles

```bash
# Développement
pnpm dev              # Serveur dev
pnpm build            # Build production
pnpm preview          # Aperçu build

# Qualité
pnpm format           # Prettier
pnpm lint             # ESLint + Prettier
pnpm check            # Type checking Svelte
/quality-check        # Lint + Format + Check (commande slash)

# Tests
pnpm test             # Exécuter tests Vitest
```

## 🗄️ Prisma - Triple Base

**Base CENOV (Production):**

```bash
pnpm prisma:generate        # Générer client
pnpm prisma:studio          # Ouvrir Studio
pnpm prisma:push            # Pousser schéma
pnpm prisma:pull            # Récupérer schéma depuis BDD
```

**Base CENOV_DEV (Développement):**

```bash
pnpm prisma:generate-dev    # Générer client dev
pnpm prisma:studio-dev      # Ouvrir Studio dev
pnpm prisma:push-dev        # Pousser schéma dev
pnpm prisma:pull-dev        # Récupérer schéma depuis BDD dev
```

**Base CENOV_PREPROD (Pré-production):**

```bash
pnpm prisma:generate-preprod    # Générer client preprod
pnpm prisma:studio-preprod      # Ouvrir Studio preprod
pnpm prisma:push-preprod        # Pousser schéma preprod
pnpm prisma:pull-preprod        # Récupérer schéma depuis BDD preprod
```

**Tout générer:**

```bash
pnpm prisma:generate-all    # Les 3 clients (auto au pnpm install)
```

### Architecture Triple Base

**3 bases PostgreSQL séparées:**

1. **CENOV** (`DATABASE_URL`) - Production
   - 12 tables (7 `produit` + 5 `public`)
   - 5 vues

2. **CENOV_DEV** (`CENOV_DEV_DATABASE_URL`) - Développement
   - 15 tables (7 `produit` + 8 `public`)
   - 6 vues

3. **CENOV_PREPROD** (`CENOV_PREPROD_DATABASE_URL`) - Pré-production
   - 15 tables (7 `produit` + 8 `public`)
   - 6 vues

### Import Clients Prisma

```typescript
// CENOV (principale)
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// CENOV_DEV
import { PrismaClient as CenovDevPrismaClient } from '../../prisma/cenov_dev/generated';
const cenovDevPrisma = new CenovDevPrismaClient();

// CENOV_PREPROD
import { PrismaClient as CenovPreprodPrismaClient } from '../../prisma/cenov_preprod/generated';
const cenovPreprodPrisma = new CenovPreprodPrismaClient();

// ⚠️ Erreur SSR "exports is not defined" → Utiliser getClient()
import { getClient } from '$lib/prisma-meta';
const prisma = (await getClient('cenov_dev')) as unknown as CenovDevPrismaClient;
```

## 🌍 Variables d'Environnement

**Validation centralisée avec @t3-oss/env-core + Zod**

### Architecture Split (Server/Client)

```typescript
// ✅ Variables serveur (secrets, URLs DB)
import { env } from '$lib/server/env';

const dbUrl = env.DATABASE_URL; // Type: string (garanti)
const limit = env.BODY_SIZE_LIMIT; // Type: number (auto-converti)
const useDevViews = env.USE_DEV_VIEWS; // Type: boolean (auto-converti)

// ✅ Variables publiques (préfixe PUBLIC_*)
import { env } from '$lib/env.client';
// Variables PUBLIC_* exposées au client
```

### Variables Validées

**Bases de données:**

- `DATABASE_URL` - CENOV (production)
- `CENOV_DEV_DATABASE_URL` - Développement
- `CENOV_PREPROD_DATABASE_URL` - Pré-production

**Authentification Logto:**

- `SECRET_LOGTO_*` - Configuration auth (endpoint, app ID, secret, cookie key, redirect URIs)

**Configuration:**

- `BODY_SIZE_LIMIT` - Limite taille requêtes (défaut: 10MB)
- `USE_DEV_VIEWS` - Utiliser vues dev (défaut: false)

### Bénéfices

- ✅ Type-safety totale - Plus de non-null assertions (`!`)
- ✅ Validation au démarrage - Échec rapide avec messages clairs
- ✅ Transformations auto - String → Number/Boolean via Zod
- ✅ Sécurité - Séparation server/client stricte

## 🔒 Sécurité Prisma - RÈGLE CRITIQUE

**JAMAIS `$queryRawUnsafe` - Risque injection SQL !**

### ✅ Méthodes Sécurisées

```typescript
// 1. ORM Prisma (RECOMMANDÉ)
const data = await prisma.user.findMany({
	where: { id: userId },
	skip: skip,
	take: limit
});

// Accès dynamique sécurisé
const table = prisma[tableName] as {
	findMany?: (args: { skip: number; take: number }) => Promise<Record<string, unknown>[]>;
};
if (!table?.findMany) throw new Error(`Table invalide`);
const data = await table.findMany({ skip, take: limit });

// 2. Si SQL brut nécessaire : $queryRaw + tagged template
import { Prisma } from '@prisma/client';
const data = await prisma.$queryRaw`
   SELECT * FROM ${Prisma.raw(`"${schema}"."${tableName}"`)}
   LIMIT ${limit} OFFSET ${skip}
`;

// 3. TOUJOURS valider les entrées
function validateIdentifier(value: string, context: string): void {
	if (!/^[a-z_][a-z0-9_]*$/i.test(value)) {
		throw new Error(`${context} invalide: ${value}`);
	}
}
```

**Checklist:**

- [ ] Jamais `$queryRawUnsafe`
- [ ] Préférer méthodes Prisma ORM
- [ ] Si SQL brut: `$queryRaw` + tagged template
- [ ] Valider TOUTES les entrées utilisateur

## 📝 Bonnes Pratiques TypeScript

**Éviter `any` - Utiliser `unknown`:**

```typescript
// ❌ MAUVAIS
const data: any[] = [];
const previewData: Record<string, any[]> = {};

// ✅ BON
const data: Record<string, unknown>[] = [];
const previewData: Record<string, unknown[]> = {};

// ✅ BON - Interface spécifique
interface TableData {
	id: number;
	name: string;
	[key: string]: unknown;
}
const data: TableData[] = [];
```

## 🎨 Composants UI - Variantes

### Boutons

- `bleu` (défaut), `vert`, `rouge`, `jaune`, `noir`, `blanc` (outline), `link`

### Badges

- `default`, `bleu`, `vert`, `rouge`, `noir`, `blanc` (outline), `orange`

### Intégration Icônes Badge

```svelte
<!-- ✅ CORRECT - Le composant gère automatiquement taille/espacement -->
<Badge variant="vert">
	<Eye />
	Vues
</Badge>

<!-- ❌ MAUVAIS - Ne pas ajouter classes manuellement -->
<Badge variant="vert">
	<Eye class="mr-1 h-3 w-3" />
	Vues
</Badge>
```

**Style auto:** `[&>svg]:size-3`, `gap-1`, `items-center`

### Cards - Padding par Défaut

```svelte
<!-- Card.Root → py-6, Card.Content → px-6 -->
<!-- ❌ MAUVAIS -->
<Card.Content class="pt-6">

<!-- ✅ CORRECT -->
<Card.Content>
```

**Règle:** Vérifier classes du composant avant d'ajouter padding/margin.

## 🔔 Notifications Toast (Sonner)

```typescript
// ✅ CORRECT Import
import { toast } from 'svelte-sonner';

// Utilisation
toast.error('Message erreur');
toast.success('Message succès');
toast('Message info');

// ❌ MAUVAIS - Ne pas importer depuis $lib/components/ui/sonner
```

**Timing:**

- Toasts au chargement: `setTimeout` avec 100ms dans `onMount`
- Gestionnaires événements: Appel direct

## ⚛️ Svelte 5 - Patterns de Migration

### Console.log Accidentellement Réactifs

**⚠️ Symptôme:** Fonctionnalité casse après suppression de `console.log`

```typescript
// ❌ PROBLÈME - console.log maintient la réactivité
$: if (condition) {
	someVariable = newValue;
	console.log('Debug:', someVariable); // Force évaluation !
}

// ✅ SOLUTION - Svelte 5 propre
let config = $state(null);
let shouldSaveConfig = $derived(step === 3 && data.length > 0 && !config);

$effect(() => {
	if (shouldSaveConfig) {
		config = { ...formData };
		console.log('Config sauvée:', config); // Informatif seulement
	}
});
```

### Patterns Essentiels

```typescript
// 1. État
let state = $state(initialValue);

// 2. Props
let { data } = $props();

// 3. Dérivé
let filteredData = $derived(data.filter((item) => item.active));

// 4. Effets
$effect(() => {
   if (condition) performSideEffect();
});

// 5. Composants Dynamiques
{@const Component = getComponent(type)}
<Component />
```

## 🔍 Résolution Problèmes

**Si bloqué après 2-3 tentatives → WebSearch !**

**Exemples nécessitant recherche web:**

- Comportements contre-intuitifs
- Messages d'erreur obscurs
- Problèmes compatibilité versions
- Erreurs qui fonctionnent en dev mais échouent en build

**Indicateurs:** Même erreur après 3 tentatives → Rechercher !

## 📂 Structure Clés

### Routes Principales

- [src/routes/database-explorer/+page.svelte](src/routes/database-explorer/+page.svelte) - Explorateur de bases de données
- [src/routes/export/+page.svelte](src/routes/export/+page.svelte) - Export de données (Excel, CSV, JSON)
- [src/routes/importV2/+page.svelte](src/routes/importV2/+page.svelte) - Import de données (V2)
- [src/routes/wordpress/+page.svelte](src/routes/wordpress/+page.svelte) - Export WordPress

### Fichiers Essentiels

- [src/lib/components/ui/](src/lib/components/ui/) - **Composants Shadcn/UI (TOUJOURS utiliser ces composants)**
- [src/lib/schemas/dbSchema.ts](src/lib/schemas/dbSchema.ts) - Schémas Zod
- [src/lib/prisma-meta.ts](src/lib/prisma-meta.ts) - Utilitaires métadonnées Prisma
- [src/lib/server/logger.ts](src/lib/server/logger.ts) - Logger Pino
- [src/lib/server/env.ts](src/lib/server/env.ts) - Variables env serveur (validation Zod)
- [src/lib/auth/protect.ts](src/lib/auth/protect.ts) - Routes protégées Logto
- [prisma/cenov/schema.prisma](prisma/cenov/schema.prisma) - Schéma DB principal

## 🎨 Design & UI - Règles Strictes

### Composants UI - TOUJOURS Shadcn/UI

**RÈGLE:** Utiliser en priorité les composants de [src/lib/components/ui/](src/lib/components/ui/)

```typescript
// ✅ CORRECT - Importer depuis src/lib/components/ui/
import { Button } from '$lib/components/ui/button';
import { Card } from '$lib/components/ui/card';
import { Badge } from '$lib/components/ui/badge';

// ❌ MAUVAIS - Créer des composants custom ou utiliser d'autres sources
import { Button } from 'flowbite-svelte';
import CustomButton from './CustomButton.svelte';
```

### Mobile-First avec TailwindCSS

**RÈGLE:** Toujours concevoir d'abord pour mobile, puis adapter pour desktop.

```svelte
<!-- ✅ CORRECT - Mobile-first responsive -->
<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
<div class="text-sm sm:text-base lg:text-lg">

<!-- ❌ MAUVAIS - Desktop-first -->
<div class="grid grid-cols-4 gap-4">
<div class="flex-row items-center">
```

**Breakpoints TailwindCSS:**

- Mobile (< 640px) : Classes par défaut (sans préfixe)
- Tablet (≥ 640px) : `sm:` préfixe
- Desktop (≥ 1024px) : `lg:` préfixe

**Pattern grilles statistiques obligatoire:**

```svelte
<!-- Mobile 1 col → Tablet 2 cols → Desktop 4 cols -->
<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
```

### Dégradés - INTERDITS par Défaut

**RÈGLE CRITIQUE:** Eviter d'utiliser de dégradés CSS, sauf si l'utilisateur vous le demande explicitement.

## 📝 Logging avec Pino

**RÈGLE:** Utiliser le logger Pino centralisé pour tous les logs côté serveur.

```typescript
// ✅ CORRECT - Import logger
import { logger, createChildLogger } from '$lib/server/logger';

// Logging simple
logger.info({ userId: 123 }, 'User logged in');
logger.error({ error }, 'Database error');
logger.debug({ tableId: 'kit' }, 'Processing table');

// Child logger avec module context
const exportLogger = createChildLogger('export');
exportLogger.info({ database: 'cenov' }, 'Starting export');

// ❌ MAUVAIS - console.log côté serveur
console.log('User logged in:', userId);
console.error('Error:', error);
```

**Configuration automatique:**

- **Dev:** Pretty print colorisé, niveau `debug`
- **Prod:** JSON structuré, niveau `info`

**Niveaux disponibles:** `trace`, `debug`, `info`, `warn`, `error`, `fatal`

## 📚 Documentation Détaillée

Pour des guides approfondis, consultez la documentation spécialisée :

- [Debugging Svelte 5](./.claude/rules/svelte-debugging.md) - Diagnostiquer et résoudre les problèmes de réactivité
- [Principe Anti-Hardcoding Prisma](./.claude/rules/prisma-dmmf.md) - Utiliser métadonnées DMMF au lieu de hardcoding
- [Corrections SonarLint](./.claude/rules/sonarqube-fixes.md) - Top 5 corrections récurrentes et guide de référence

## ⚠️ Règles Critiques

1. **Chemins fichiers:** TOUJOURS `process.cwd()` (JAMAIS `import.meta.url` en prod)
2. **Zod 4.1.12 requis:** `import { z } from 'zod/v4'` + `zod4(schema)` avec Superforms
3. **Prisma sécurité:** JAMAIS `$queryRawUnsafe`
4. **Svelte 5:** Utiliser `$state`, `$derived`, `$effect`, `$props` en priorité
5. **Clés boucles:** Toujours `{#each items as item (item.id)}`
6. **Chemins Windows:** Utiliser chemins absolus `C:\...` pour opérations fichiers
7. **Anti-Hardcoding:** Utiliser Prisma DMMF pour métadonnées DB (voir [prisma-dmmf.md](./.claude/rules/prisma-dmmf.md))
