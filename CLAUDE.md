# CLAUDE.md

Ce fichier fournit des instructions à Claude Code pour travailler sur ce dépôt.

## ⚠️ Chemins Fichiers: Utiliser process.cwd() en Production

**CRITIQUE**: Ne JAMAIS utiliser `import.meta.url` + `fileURLToPath` pour résoudre chemins en production.

```typescript
// ❌ NE MARCHE PAS en production (bundle dans .svelte-kit/output/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

// ✅ FONCTIONNE en DEV et PROD
const projectRoot = process.cwd();
```

**Pourquoi**: `import.meta.url` pointe vers le bundle après build, pas la racine projet. `process.cwd()` pointe toujours vers la racine.

## 🔍 Bonnes Pratiques de Résolution de Problèmes

**IMPORTANT : Rechercher sur le web quand bloqué**

Si une solution ne fonctionne pas après **2-3 tentatives**, **ARRÊTER** et utiliser la recherche web :

```
✅ BON WORKFLOW :
1. Essayer solution initiale
2. Si échec → essayer 1-2 variantes
3. Si toujours bloqué → WebSearch pour trouver la vraie solution
4. Appliquer la solution trouvée

❌ MAUVAIS WORKFLOW :
1. Essayer solution
2. Échec → essayer variante 1
3. Échec → essayer variante 2
4. Échec → essayer variante 3
5. Échec → essayer variante 4...
→ Perte de temps et frustration utilisateur
```

**Exemples de situations nécessitant WebSearch :**

- Erreurs de configuration d'outils (ESLint, Prettier, TypeScript, Vite)
- Problèmes spécifiques à un framework/bibliothèque (SvelteKit, Prisma...)
- Messages d'erreur obscurs ou inattendus (erreurs de build cryptiques)
- Comportements contre-intuitifs (réactivité Svelte qui casse)
- Problèmes de compatibilité entre versions de packages
- Erreurs TypeScript complexes avec types génériques/conditionnels
- Problèmes qui fonctionnent en dev mais échouent en build
- Erreurs Prisma generate/migrate mystérieuses
- Conflits entre outils (Prettier vs ESLint, TypeScript vs Svelte)
- Problèmes de chemins relatifs/absolus qui ne se résolvent pas
- Erreurs de permissions ou accès fichiers sur Windows
- Git qui bloquent sans raison claire
- Migration framework (Svelte 4 → 5, SvelteKit v1 → v2)

**Règle d'or :** Ne pas s'acharner. La recherche web est là pour ça.

**Indicateurs qu'il faut rechercher :**

- ❌ Même type d'erreur après 3 tentatives différentes
- ❌ Solution "qui devrait marcher" selon la doc mais ne marche pas
- ❌ Erreur qui semble être un bug du framework/outil
- ❌ Comportement différent entre environnements (local vs CI, dev vs build)
- ❌ Sentiment de frustration ou de tourner en rond

## Commandes de Développement

**Gestionnaire de paquets :** Ce projet utilise pnpm par défaut. Utiliser `pnpm` au lieu de `npm` :

**Serveur de développement :**

```bash
pnpm dev
```

**Build et aperçu :**

```bash
pnpm build
pnpm preview
```

**Qualité du code :**

```bash
pnpm format     # Formatage avec Prettier
pnpm lint       # Vérification Prettier + ESLint
pnpm check     # Type checking avec Svelte
```

**Tests :**

```bash
pnpm test:unit    # Exécuter les tests Vitest
pnpm test         # Exécuter les tests une fois
```

**⚠️ Bug Prisma Generate - Suppression Points-virgules :**

`prisma generate` formate les fichiers générés SANS points-virgules, mais `pnpm format` les rajoute automatiquement.

**Comportement attendu :**

1. `pnpm prisma:generate` → Fichiers générés sans `;`
2. `pnpm format` → Rajoute automatiquement les `;`
3. Les points-virgules réapparaissent après formatage

**Action :** Aucune action nécessaire, c'est le comportement normal. Prisma et Prettier ont des styles différents.

**Workflow Git avec Gitmoji :**

```bash
/quick-push  # Commande slash : Add, Diff, Commit avec gitmoji, et Push
```

La commande `/quick-push` automatise le workflow Git complet :

1. Stage tous les fichiers (`git add -A`)
2. Affiche un résumé des changements (`git diff --cached --stat`)
3. Analyse et propose le bon gitmoji selon les changements
4. Crée un commit avec message < 72 caractères (SANS signature Claude Code)
5. Push vers main (`git push origin main`)

**Gitmojis principaux utilisés :**

- `:bug:` - Corrections de bugs
- `:sparkles:` - Nouvelles fonctionnalités
- `:recycle:` - Refactoring de code
- `:fire:` - Suppression de code/fichiers
- `:lipstick:` - Mise à jour UI/styles
- `:art:` - Amélioration structure/format
- `:zap:` - Amélioration performance
- `:memo:` - Mise à jour documentation

**Opérations base de données :**

**⚠️ Prisma 7 : Configuration requise**

Chaque base nécessite un fichier `prisma.config.ts` dans son dossier (`prisma/cenov/`, `prisma/cenov_dev/`, `prisma/cenov_preprod/`) :

```typescript
import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Charger .env depuis la racine du projet
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../.env') });

export default defineConfig({
	datasource: {
		url: env('DATABASE_URL') // ou CENOV_DEV_DATABASE_URL, CENOV_PREPROD_DATABASE_URL
	},
	schema: './schema.prisma'
});
```

**Base CENOV (Principale - Production) :**

```bash
pnpm prisma:generate                        # Générer client Prisma (cenov)
pnpm prisma:migrate                        # Exécuter migrations base de données (cenov)
pnpm prisma:studio                         # Ouvrir Prisma Studio (cenov)
pnpm prisma:push                          # Pousser schéma vers base de données (cenov)
pnpm prisma:pull                          # Récupérer schéma depuis base de données (cenov)
```

**Base CENOV_DEV (Développement) :**

```bash
pnpm prisma:generate-dev                   # Générer client Prisma (cenov_dev)
pnpm prisma:migrate-dev                    # Exécuter migrations (cenov_dev)
pnpm prisma:studio-dev                     # Ouvrir Prisma Studio (cenov_dev)
pnpm prisma:push-dev                       # Pousser schéma vers BDD (cenov_dev)
pnpm prisma:pull-dev                       # Récupérer schéma depuis BDD (cenov_dev)
```

**Base CENOV_PREPROD (Pré-production) :**

```bash
pnpm prisma:generate-preprod               # Générer client Prisma (cenov_preprod)
pnpm prisma:migrate-preprod                # Exécuter migrations (cenov_preprod)
pnpm prisma:studio-preprod                 # Ouvrir Prisma Studio (cenov_preprod)
pnpm prisma:push-preprod                   # Pousser schéma vers BDD (cenov_preprod)
pnpm prisma:pull-preprod                   # Récupérer schéma depuis BDD (cenov_preprod)
```

**Générer tous les clients :**

```bash
pnpm prisma:generate-all                   # Générer les trois clients (automatique au pnpm install)
```

**Installation des dépendances :**

```bash
pnpm install              # Installer toutes les dépendances
pnpm add <package>        # Ajouter une dépendance
pnpm add -D <package>     # Ajouter une dépendance de dev
```

## Variables d'Environnement

**Système de validation centralisé avec @t3-oss/env-core**

Le projet utilise une validation type-safe des variables d'environnement avec Zod. Les variables sont validées au démarrage de l'application - si une variable est manquante ou invalide, l'application refuse de démarrer avec un message d'erreur clair.

**Architecture Split (Server/Client) :**

```typescript
// ✅ Variables serveur (secrets, URLs DB, config auth)
import { env } from '$lib/server/env';

const dbUrl = env.DATABASE_URL; // Type: string (garanti présent)
const limit = env.BODY_SIZE_LIMIT; // Type: number (auto-converti)
const useDevViews = env.USE_DEV_VIEWS; // Type: boolean (auto-converti)

// ✅ Variables publiques (futures, actuellement vide)
import { env } from '$lib/env.client';
// Les variables PUBLIC_* seront exposées au client
```

**Fichiers de configuration :**

- `src/lib/server/env.ts` - Variables serveur uniquement (DATABASE*URL, SECRET_LOGTO*\*, etc.)
- `src/lib/env.client.ts` - Variables publiques (préfixe PUBLIC\_\*, actuellement vide)
- `.env` - Fichier contenant toutes les variables d'environnement

**Variables validées :**

- `DATABASE_URL` - Base CENOV principale
- `CENOV_DEV_DATABASE_URL` - Base développement
- `CENOV_PREPROD_DATABASE_URL` - Base pré-production
- `SECRET_LOGTO_*` - Configuration authentification Logto (endpoint, app ID, secret, cookie key, redirect URIs)
- `BODY_SIZE_LIMIT` - Limite taille requêtes (défaut: 10MB, converti en number)
- `USE_DEV_VIEWS` - Utiliser vues dev (défaut: false, converti en boolean)

**Bénéfices :**

- ✅ Type-safety totale - Plus besoin de non-null assertions (`!`)
- ✅ Validation au démarrage - Échec rapide avec messages clairs
- ✅ Transformations automatiques - String → Number/Boolean via Zod
- ✅ Valeurs par défaut centralisées dans le schéma
- ✅ Architecture sécurisée - Séparation server/client

## Vue d'Ensemble de l'Architecture

### Stack Technique

- **Frontend:** SvelteKit avec TypeScript
- **Version Svelte:** **Svelte 5** (utiliser en priorité : `$state`, `$derived`, `$effect`, `$props`)
- **Base de données:** PostgreSQL avec Prisma ORM
- **Styles:** TailwindCSS avec composants Flowbite et Shadcn Svelte
- **Authentification:** Intégration Logto
- **Traitement fichiers:** Capacités d'import XLSX
- **Tests:** Vitest avec Testing Library

### Architecture Base de Données

**Architecture Triple Base :**

L'application utilise **TROIS bases de données séparées** :

1. **Base CENOV** (`DATABASE_URL`) - Base principale de production
   - Système principal de gestion des produits, kits et pièces
   - **12 tables** : 7 schéma `produit` + 5 schéma `public`
   - **Tables produit** : categorie, categorie_attribut, cross_ref, famille, produit, produit_categorie, tarif_achat
   - **Tables public** : attribut, fournisseur, kit, kit_attribute, part_nc
   - **5 vues** : 2 schéma `produit` + 3 schéma `public`
   - **Vues produit** : v_produit_categorie_attribut, v_tarif_achat
   - **Vues public** : v_categorie, v_kit_caracteristique, v_produit_categorie_attribut

2. **Base CENOV_DEV** (`CENOV_DEV_DATABASE_URL`) - Base développement étendue
   - Catalogue produits étendu et gestion fournisseurs avancée
   - **15 tables** : 7 schéma `produit` + 8 schéma `public`
   - **Tables produit** : category, category_attribute, cross_ref, family, price_purchase, product, product_category
   - **Tables public** : attribute, attribute_unit, attribute_value, document, kit, kit_attribute, part_nc, supplier
   - **6 vues** : 3 schéma `produit` + 3 schéma `public`
   - **Vues produit** : mv_categorie, v_price_purchase, v_produit_categorie_attribut
   - **Vues public** : attribute_required, v_categorie, v_kit_caracteristique

3. **Base CENOV_PREPROD** (`CENOV_PREPROD_DATABASE_URL`) - Base pré-production
   - Environnement de pré-production pour tests avant déploiement
   - **15 tables** : 7 schéma `produit` + 8 schéma `public`
   - **Tables produit** : category, category_attribute, cross_ref, family, price_purchase, product, product_category
   - **Tables public** : attribute, attribute_unit, attribute_value, document, kit, kit_attribute, part_nc, supplier
   - **6 vues** : 3 schéma `produit` + 3 schéma `public`
   - **Vues produit** : mv_categorie, v_price_purchase, v_produit_categorie_attribut
   - **Vues public** : attribute_required, v_categorie, v_kit_caracteristique

- **CENOV** : 12 tables, 5 vues
- **CENOV_DEV** : 15 tables, 6 vues
- **CENOV_PREPROD** : 15 tables, 6 vues

## Principe Anti-Hardcoding avec Prisma DMMF

**RÈGLE :** Toujours vérifier si un hardcoding peut être remplacé par des métadonnées Prisma DMMF.

```typescript
// ❌ MAUVAIS - Hardcoding de données DB
const databases = ['cenov', 'cenov_dev'];
if (dbName !== 'cenov' && dbName !== 'cenov_dev') throw new Error('BDD inconnue');
if (database === 'cenov') return 1;

// ✅ BON - Utiliser Prisma DMMF
const databases = await getAllDatabaseNames();
if (!validDatabases.includes(dbName)) throw new Error(`BDD inconnue`);
return a.database.localeCompare(b.database);

// ✅ OK - Config UI acceptable
export const DATABASE_CONFIG = { cenov: { icon: RocketIcon, variant: 'bleu' } };
const schema = metadata.schema || 'public'; // Standard SQL
```

**Fonctions DMMF :** `getAllDatabaseNames()`, `getTableMetadata()`, `getAllDatabaseTables()`

**Règle :** Données DB → Prisma DMMF | UI/Config → Fichier centralisé

## 🔒 Sécurité Prisma - Éviter les Injections SQL

**RÈGLE CRITIQUE :** NE JAMAIS utiliser `$queryRawUnsafe` ou construire des requêtes SQL manuellement.

### ❌ Méthodes dangereuses à éviter

```typescript
// ❌ DANGEREUX - Injection SQL possible
const query = `SELECT * FROM ${tableName} WHERE id = ${userId}`;
await prisma.$queryRawUnsafe(query);

// ❌ DANGEREUX - Concaténation de strings
const query = `SELECT * FROM users LIMIT ${limit} OFFSET ${skip}`;
await prisma.$queryRawUnsafe(query);

// ❌ DANGEREUX - Même avec échappement manuel
const query = `SELECT * FROM "${schema}"."${table}" LIMIT ${limit}`;
await prisma.$queryRawUnsafe(query);
```

### ✅ Alternatives sécurisées

**1. Utiliser les méthodes Prisma ORM (RECOMMANDÉ)**

```typescript
// ✅ SÉCURISÉ - Paramètres échappés automatiquement
const data = await prisma.user.findMany({
	where: { id: userId },
	skip: skip,
	take: limit
});

// ✅ Accès dynamique aux tables
const table = prisma[tableName] as {
	findMany?: (args: { skip: number; take: number }) => Promise<Record<string, unknown>[]>;
};

if (!table?.findMany) {
	throw new Error(`Table ${tableName} invalide`);
}

const data = await table.findMany({ skip, take: limit });
```

**2. Si SQL brut nécessaire : $queryRaw avec tagged template**

```typescript
// ✅ SÉCURISÉ - Utiliser Prisma.sql pour identifiants
import { Prisma } from '@prisma/client';

const schema = 'public';
const tableName = 'users';
const limit = 100;
const skip = 0;

const data = await prisma.$queryRaw`
	SELECT *
	FROM ${Prisma.raw(`"${schema}"."${tableName}"`)}
	LIMIT ${limit}
	OFFSET ${skip}
`;
```

**3. Validation stricte obligatoire**

```typescript
// ✅ Toujours valider les entrées utilisateur
function validateIdentifier(value: string, context: string): void {
	if (!/^[a-z_][a-z0-9_]*$/i.test(value)) {
		throw new Error(`${context} invalide: ${value}`);
	}
}

function validateNumber(value: number, name: string, min: number, max: number): number {
	if (!Number.isInteger(value) || value < min || value > max) {
		throw new Error(`${name} invalide: ${value}`);
	}
	return value;
}

// Utilisation
validateIdentifier(schema, 'Schema');
validateIdentifier(tableName, 'Table');
const safeLimit = validateNumber(limit, 'Limit', 1, 10000);
const safePage = validateNumber(page, 'Page', 1, 10000);
```

**Checklist sécurité Prisma :**

- [ ] Jamais `$queryRawUnsafe` dans le code
- [ ] Toujours utiliser méthodes Prisma ORM quand possible
- [ ] Si SQL brut : utiliser `$queryRaw` avec tagged template
- [ ] Valider TOUS les paramètres utilisateur (regex + limites)
- [ ] Vérifier les types avec type guards avant accès dynamique

### Utilisation Client Prisma

**Importer le bon client :**

```typescript
// Pour la base CENOV (principale):
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Pour la base CENOV_DEV:
import { PrismaClient as CenovDevPrismaClient } from '../../prisma/cenov_dev/generated';
const cenovDevPrisma = new CenovDevPrismaClient();

// Pour la base CENOV_PREPROD:
import { PrismaClient as CenovPreprodPrismaClient } from '../../prisma/cenov_preprod/generated';
const cenovPreprodPrisma = new CenovPreprodPrismaClient();

// Exemples d'utilisation:
const kits = await prisma.kit.findMany(); // Base CENOV
const products = await cenovDevPrisma.product.findMany(); // Base CENOV_DEV
const preprodProducts = await cenovPreprodPrisma.product.findMany(); // Base CENOV_PREPROD
```

**Gestion des Connexions :**

- CENOV: Client Prisma standard pour opérations principales
- CENOV_DEV: Client séparé pour fonctionnalités catalogue produits
- CENOV_PREPROD: Client séparé pour environnement de pré-production
- Les trois bases peuvent être utilisées simultanément

**⚠️ Erreur SSR "exports is not defined" :**

Si erreur `exports is not defined` sur une route → NE PAS importer directement le client Prisma cenov_dev ou cenov_preprod. Utiliser `getClient()` :

```typescript
// ❌ Cause l'erreur
import { PrismaClient } from '../../../prisma/cenov_dev/generated/index.js';
import { PrismaClient } from '../../../prisma/cenov_preprod/generated/index.js';

// ✅ Solution SSR-safe
import { getClient } from '$lib/prisma-meta';
const prisma = (await getClient('cenov_dev')) as unknown as CenovDevPrismaClient;
const prismaPreprod = (await getClient('cenov_preprod')) as unknown as CenovPreprodPrismaClient;
```

### Structure des Fichiers Clés

- `src/routes/` - Pages SvelteKit (categories, kits, import, products)
- `src/lib/components/` - Composants Svelte réutilisables incluant bibliothèque UI
- `src/lib/schemas/dbSchema.ts` - Schémas de validation Zod pour toutes les entités
- `src/lib/prisma-meta.ts` - Utilitaires centralisés métadonnées Prisma
- `prisma/cenov/schema.prisma` - Schéma base de données principal

### Utilitaires Prisma Meta

**`src/lib/prisma-meta.ts`** fournit des fonctions centralisées de métadonnées via Prisma DMMF (Data Model Meta Format) :

**Fonctions Principales :**

- `getDatabases()` - Accès aux clients et métadonnées des trois bases
- `getTableMetadata(database, tableName)` - Détection schéma via DMMF
- `getAllTables(database)` - Tables avec détection automatique du schéma
- `getAllDatabaseTables()` - Tables combinées des trois bases

**Bonnes Pratiques :**

- **Éviter le hardcoding** - Utiliser métadonnées Prisma DMMF au lieu de valeurs hardcodées
- Détection schéma: Utiliser `metadata.schema` depuis `getTableMetadata()`
- Listes de tables: Utiliser `getAllTables()` au lieu de noms hardcodés
- Infos base: Utiliser propriétés DMMF au lieu de comparaisons de chaînes
- Détection dynamique préférée aux listes statiques pour la maintenabilité

### Authentification

Utilise Logto pour l'authentification avec :

- Routes protégées via `src/lib/auth/protect.ts`
- Gestion session utilisateur dans les layouts
- Gestion callback pour flux OAuth

### Système d'Import

Fonctionnalité d'import de fichiers Excel pour :

- Catégories et attributs
- Hiérarchies de kits et caractéristiques
- Localisé dans les routes `/import` et `/products/import`

## Notes de Développement

- Utilise pnpm comme gestionnaire de paquets
- Support des schémas de production et développement (tables/vues \_dev)
- Composants UI personnalisés construits sur bits-ui et Flowbite
- Validation de formulaires avec **Zod 4.1.12** et **SvelteKit Superforms 2.28.0**

## Zod 4 et SvelteKit Superforms

**Version requise :** `zod@4.1.12` (pas de version 3.x)

**Utilisation correcte :**

```typescript
// ✅ CORRECT
import { z } from 'zod/v4';
import { zod4 } from 'sveltekit-superforms/adapters';

const schema = z.object({ name: z.string() });
const form = await superValidate(zod4(schema)); // Utiliser zod4, pas zod
```

**Breaking changes Zod 4 :**

```typescript
// errorMap → error
z.enum(['a', 'b'], { error: 'Invalide' }); // Avant: errorMap: () => ({ message: ... })

// z.record() nécessite 2 arguments
z.record(z.string(), z.unknown()); // Avant: z.record(z.unknown())

// z.refine() - cast explicite
zodType.refine((val) => !isNaN(parseFloat(val as string)), { ... });
```

**Si erreur "ZodObject is not assignable" :**

```bash
pnpm why zod              # Vérifier qu'il n'y a QU'UNE version (4.1.12)
pnpm remove zod           # Si plusieurs versions
pnpm add -D zod@4.1.12    # Réinstaller
```

## Bonnes Pratiques TypeScript

**Éviter le type `any`** - Préférer des types spécifiques pour éviter les erreurs @typescript-eslint/no-explicit-any :

```typescript
// ❌ MAUVAIS - Utiliser any
const data: any[] = [];
const previewData: Record<string, any[]> = {};

// ✅ BON - Utiliser des types spécifiques
const data: Record<string, unknown>[] = [];
const previewData: Record<string, unknown[]> = {};

// ✅ BON - Utiliser des définitions d'interface
interface TableData {
	id: number;
	name: string;
	[key: string]: unknown; // Pour propriétés dynamiques
}
const data: TableData[] = [];
```

**Remplacements TypeScript courants :**

- `any[]` → `unknown[]` ou `Record<string, unknown>[]`
- `any` → `unknown` ou interface spécifique
- `Record<string, any>` → `Record<string, unknown>`
- Pour résultats Prisma: utiliser types générés ou `Record<string, unknown>`

**Quand utiliser `unknown` :**

- Réponses API externes
- Données dynamiques depuis bases de données
- Entrées utilisateur nécessitant validation
- Structures de données génériques

## Corrections SonarLint Récurrentes

**Erreurs fréquentes et leurs corrections rapides :**

```typescript
// ❌ S7773 - Fonctions globales
isNaN(value);
parseInt(value, 10);
parseFloat(value);

// ✅ S7773 - Méthodes Number
Number.isNaN(value);
Number.parseInt(value, 10);
Number.parseFloat(value);

// ❌ S7728 - forEach avec return
items.forEach((item) => {
	if (condition) return; // Ne sort pas de la fonction parente !
	process(item);
});

// ✅ S7728 - for...of avec continue
for (const item of items) {
	if (condition) continue;
	process(item);
}

// ❌ S6551 - Stringification implicite
return String(value); // Type unknown

// ✅ S6551 - Type narrowing explicite
if (typeof value === 'string') return value;
if (typeof value === 'number') return String(value);
return JSON.stringify(value);

// ❌ S2871 - Sort sans comparateur
array.sort(); // Tri alphabétique par défaut

// ✅ S2871 - Sort avec comparateur
array.sort((a, b) => a.localeCompare(b)); // Strings
array.sort((a, b) => a - b); // Numbers

// ❌ S7741 + S6606 - typeof undefined
if (typeof globalThis.foo === 'undefined') {
	globalThis.foo = defaultValue;
}

// ✅ S7741 + S6606 - Nullish coalescing
globalThis.foo ??= defaultValue;
```

**Checklist avant commit :**

- [ ] Remplacer `isNaN/parseInt/parseFloat` → `Number.*`
- [ ] Remplacer `.forEach()` avec `return` → `for...of` avec `continue`
- [ ] Ajouter type narrowing explicite pour `unknown`
- [ ] Ajouter comparateur à `.sort()`
- [ ] Utiliser `??=` au lieu de `typeof === 'undefined'`

## Guide Composants UI

**Variantes de boutons disponibles :**

- `bleu` (défaut) - Bouton bleu principal
- `vert` - Actions succès/confirmation
- `rouge` - Actions danger/suppression
- `jaune` - Actions avertissement
- `noir` - Actions secondaires sombres
- `blanc` - Style alternatif/outline
- `link` - Style lien texte

**Note:** La variante `outline` n'existe pas - utiliser `blanc` pour les boutons style outline.

**Variantes de badges disponibles :**

- `default` (défaut) - Style badge principal
- `bleu` - Badge informatif bleu
- `vert` - Badge succès/positif
- `rouge` - Badge erreur/danger
- `noir` - Badge secondaire/neutre
- `blanc` - Style alternatif/outline
- `orange` - Badge modification

**Note:** La variante `outline` n'existe pas pour les badges - utiliser `blanc` pour style outline.

### Intégration Icônes Badge

**IMPORTANT:** Le composant Badge gère automatiquement les icônes SVG avec style intégré :

```typescript
// ✅ CORRECT - Laisser le composant gérer taille et espacement
<Badge variant="vert">
  <Eye />
  Vues
</Badge>

// ❌ MAUVAIS - Ne pas ajouter manuellement classes taille/espacement
<Badge variant="vert">
  <Eye class="mr-1 h-3 w-3" />
  Vues
</Badge>
```

**Style Icône Badge Intégré :**

- `[&>svg]:size-3` - Toutes icônes SVG obtiennent automatiquement `size-3` (12x12px)
- `[&>svg]:pointer-events-none` - Icônes n'interfèrent pas avec événements clic
- `gap-1` - Espacement automatique entre icône et texte
- `items-center justify-center` - Alignement parfait

**Bonne Pratique :** Toujours lire les classes CSS du composant avant d'ajouter style manuel. La plupart des composants UI gèrent les icônes nativement.

### Padding/Margin Cards - NE PAS EN RAJOUTER

**Valeurs par défaut :**

- `Card.Root` → `py-6` (24px vertical)
- `Card.Content` → `px-6` (24px horizontal)

```svelte
<!-- ❌ MAUVAIS -->
<Card.Content class="pt-6">

<!-- ✅ CORRECT -->
<Card.Content>
```

**Règle :** Vérifier composant source avant d'ajouter padding/margin.

### Responsive - Grilles Statistiques

**Pattern obligatoire :**

```svelte
<!-- ✅ Mobile 1 col → Tablet 2 cols → Desktop 4 cols -->
<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
```

**Breakpoints :**

- Mobile (< 640px) : `grid-cols-1`
- Tablet (≥ 640px) : `sm:grid-cols-2`
- Desktop (≥ 1024px) : `lg:grid-cols-4`

**Règle :** Jamais plus de 2 colonnes sur mobile.

## Bonnes Pratiques Svelte - Clés dans les Boucles {#each}

### Problème : Erreur `svelte/require-each-key`

**⚠️ Symptôme :** ESLint signale "Each block should have a key" - cause bugs d'affichage et problèmes de performance.

**✅ Solution :** Toujours ajouter une clé unique

```svelte
<!-- ✅ CORRECT -->
{#each items as item (item.id)}           <!-- ID unique (meilleur) -->
{#each columns as column (column.key)}    <!-- Propriété unique -->
{#each databases as db (db)}              <!-- Valeur primitive unique -->
{#each rows as row, i (i)}                <!-- Index (dernier recours) -->

<!-- ❌ MAUVAIS -->
{#each items as item}                     <!-- Sans clé -->
```

**Priorité de choix :** ID unique > Propriété unique > Valeur primitive > Index

**Éviter ce problème à l'avenir :**

- Toujours ajouter la clé dès la création de la boucle : `{#each items as item (item.id)}`
- Si hésitation, utiliser l'index : `{#each items as item, i (i)}`

## Notifications Toast (Sonner)

Ce projet utilise **svelte-sonner** pour les notifications toast.

### Prérequis

1. **Installation :** Déjà installé comme dépendance
2. **Composant Toaster :** Doit être placé dans layout racine (`+layout.svelte`)
3. **Import :** Toujours importer directement depuis `'svelte-sonner'`

### Utilisation Correcte

```typescript
// ✅ CORRECT Import
import { toast } from 'svelte-sonner';

// ✅ CORRECT Configuration Toaster (déjà dans +layout.svelte)
import { Toaster } from 'svelte-sonner';
<Toaster position="top-center" richColors={true} />

// ✅ CORRECT Utilisation
toast.error('Message erreur');
toast.success('Message succès');
toast('Message info');
```

### Erreurs Courantes à Éviter

```typescript
// ❌ MAUVAIS - Ne pas importer depuis composants UI
import { toast } from '$lib/components/ui/sonner';

// ❌ MAUVAIS - Ne pas utiliser wrapper personnalisé pour toasts basiques
import { Toaster } from '$lib/components/ui/sonner/sonner.svelte';
```

### Bonnes Pratiques Timing

- **Toasts au chargement page :** Utiliser `setTimeout` avec petit délai (100ms) dans `onMount`
- **Gestionnaires événements :** Appeler directement sans délai
- **Après navigation :** Fonctionne immédiatement après redirections

### Intégration Authentification

Le projet a des toasts d'erreur auth intégrés :

- Routes protégées affichent automatiquement toast si accès non autorisé
- Géré via paramètres URL et `onMount` dans homepage

## Résolution Conflits Édition Fichiers

**Lors d'erreurs "File has been unexpectedly modified" :**

Cela se produit typiquement quand fichiers sont automatiquement formatés par linters/formatters (Prettier, ESLint) après lecture.

**Étapes de résolution :**

1. **Utiliser chemins Windows absolus D'ABORD :** Toujours utiliser chemins Windows absolus avec lettres de lecteur et backslashes pour TOUTES opérations fichiers :

   ```bash
   # ✅ CORRECT - Utiliser chemins Windows absolus
   C:\Users\EwanSenergous\OneDrive - jll.spear\Bureau\Projet\importData\file.js

   # ❌ MAUVAIS - Chemins relatifs ou style Unix peuvent échouer
   ./file.js
   /c/Users/.../file.js
   ```

2. **Formater avec Prettier (si conflits persistent) :** Les erreurs viennent souvent du formatage automatique Prettier/TypeScript. Relancer le formatage :

   ```bash
   pnpm format
   ```

3. **Relire avant édition :** Toujours utiliser outil Read pour obtenir dernier état fichier après formatage

4. **Comportement attendu :** Les linters peuvent formater automatiquement, c'est intentionnel et doit être préservé

5. **Git restore (dernière option seulement) :** Si tous les autres essais échouent, restaurer le fichier à son état original :

   ```bash
   git restore src/path/to/file.svelte
   ```

**Scénarios courants :**

- Prettier reformate espacement et sauts de ligne
- ESLint corrige automatiquement problèmes de style
- Ces changements sont intentionnels et améliorent qualité du code

**Bonnes pratiques :**

- **TOUJOURS essayer chemins Windows absolus d'abord** avant toute autre solution
- **Utiliser `pnpm format` ensuite** pour synchroniser le formatage
- Ne pas annuler changements linter sauf demande explicite
- **Git restore est la DERNIÈRE option** - à utiliser seulement si tout le reste échoue
- Relire fichiers après formatage pour obtenir état actuel

**Appliquer chemins Windows absolus à tous les outils :**

- Outil Read: Toujours utiliser chemins `C:\...`
- Outil Write: Toujours utiliser chemins `C:\...`
- Outil Edit: Toujours utiliser chemins `C:\...`
- Outil MultiEdit: Toujours utiliser chemins `C:\...`

## Debugging Problèmes de Réactivité Svelte

Cette section documente les techniques pour diagnostiquer et résoudre les problèmes de réactivité dans Svelte, particulièrement lors de la migration vers Svelte 5.

### Problème : Console.log Accidentellement Réactifs

**⚠️ Symptôme courant :** Une fonctionnalité cesse de marcher après suppression de `console.log` "innocents".

**🔍 Diagnostic :**

```typescript
// ❌ PROBLÉMATIQUE - console.log maintient accidentellement la réactivité
$: if (condition) {
	someVariable = newValue;
	console.log('Debug:', someVariable); // ← Force l'évaluation réactive !
}

// ❌ Quand ce log est supprimé, la réactivité peut se casser
$: if (condition) {
	someVariable = newValue;
	// La variable peut ne plus être "observée" par Svelte
}
```

### Solution : Migration Svelte 5 Propre

**✅ Remplacer les hacks réactifs par des primitives explicites :**

```typescript
// ❌ ANCIEN - Hack avec console.log
$: if (step === 3 && data.length > 0 && !config) {
	config = { ...formData };
	console.log('Config sauvée:', config); // ← Maintient la réactivité
}

// ✅ NOUVEAU - Svelte 5 propre
let config = $state(null);

let shouldSaveConfig = $derived(step === 3 && data.length > 0 && !config);

$effect(() => {
	if (shouldSaveConfig) {
		config = { ...formData };
		console.log('Config sauvée:', config); // ← Informatif seulement
	}
});
```

### Patterns de Migration Svelte 5

**1. Variables d'État :**

```typescript
// ❌ Ancien
let state = initialValue;

// ✅ Nouveau
let state = $state(initialValue);
```

**2. Props :**

```typescript
// ❌ Ancien
export let data;

// ✅ Nouveau
let { data } = $props();
```

**3. Déclarations Réactives :**

```typescript
// ❌ Ancien
$: filteredData = data.filter((item) => item.active);

// ✅ Nouveau
let filteredData = $derived(data.filter((item) => item.active));
```

**4. Effets de Bord :**

```typescript
// ❌ Ancien
$: {
	if (condition) {
		performSideEffect();
		console.log('Side effect triggered'); // ← Maintient réactivité
	}
}

// ✅ Nouveau - Effet explicite
$effect(() => {
	if (condition) {
		performSideEffect();
		console.log('Side effect triggered'); // ← Informatif seulement
	}
});
```

**5. Composants Dynamiques :**

```typescript
// ❌ Ancien - Svelte 4
<svelte:component this={getComponent(type)} />

// ✅ Nouveau - Svelte 5
{@const Component = getComponent(type)}
<Component />

// Ou dans les boucles :
{#each items as item}
    {@const ItemComponent = getComponent(item.type)}
    <ItemComponent />
{/each}
```

### Workflow de Diagnostic Complet

**Étape 1 : Identifier le Problème**

```bash
# Chercher les patterns suspects
grep -rn "console\.log.*\$" src/routes/
grep -rn "\$:.*console" src/routes/
```

**Étape 2 : Tester l'Hypothèse**

- Commenter temporairement les `console.log` suspects
- Vérifier si la fonctionnalité se casse
- Si oui → confirmer le problème de réactivité accidentelle

**Étape 3 : Analyser la Réactivité**

```typescript
// Ajouter des logs de debug pour comprendre le flux
$effect(() => {
	console.log('🔄 Reactive state changed:', stateVariable);
});

$effect(() => {
	console.log('📊 Derived value updated:', derivedValue);
});
```

**Étape 4 : Migrer vers Svelte 5**

- Remplacer `export let` → `$props()`
- Remplacer `let` variables modifiées → `$state()`
- Remplacer `$:` → `$derived` ou `$effect`
- Remplacer `<svelte:component>` → `{@const Component}`

**Étape 5 : Vérifier la Propreté**

```bash
# Vérifier qu'aucun console.log ne déclenche plus la réactivité
grep -n "console\.log" src/routes/export/*.svelte

# Les logs restants doivent être soit :
# - Dans des $effect (OK - informatif)
# - Dans des fonctions (OK - informatif)
# - Dans des handlers d'événements (OK - informatif)
# - PAS dans des déclarations réactives directes
```

### Indicateurs de Réactivité Propre

**✅ Signes que la réactivité est correcte :**

1. **Séparation claire :**
   - `$derived` pour les valeurs calculées
   - `$effect` pour les effets de bord
   - `$state` pour les variables modifiables
   - `console.log` uniquement informatifs

2. **Pas de dépendance aux logs :**
   - Supprimer tous les `console.log` ne casse rien
   - La logique fonctionne sans les logs de debug

3. **Architecture explicite :**

   ```typescript
   // ✅ Réactivité explicite et intentionnelle
   let data = $state([]);
   let filteredData = $derived(data.filter((item) => item.active));
   let count = $derived(filteredData.length);

   $effect(() => {
   	console.log('Data changed, new count:', count); // ← Informatif
   });
   ```

### Erreurs Communes à Éviter

**❌ Console.log dans déclarations réactives :**

```typescript
$: if (condition) doSomething() && console.log('done'); // ← Danger !
```

**❌ Mélanger logique et debug :**

```typescript
$: {
	processData();
	console.log('Processing...'); // ← Peut maintenir réactivité
	updateUI();
}
```

**✅ Séparer logique et debug :**

```typescript
$effect(() => {
	processData();
	updateUI();
});

$effect(() => {
	console.log('Processing...'); // ← Debug séparé
});
```
