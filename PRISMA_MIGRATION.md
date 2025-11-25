# Migration Prisma 6 → 7.0.0

Guide complet de migration vers Prisma ORM 7.0.0 pour le projet ImportData.

## 📊 Contexte

- **Prisma actuel:** 6.19.0
- **Prisma cible:** 7.0.0
- **Bases de données:** 3 bases PostgreSQL (CENOV, CENOV_DEV, CENOV_PREPROD)
- **Package manager:** pnpm
- **Architecture:** Multi-schémas avec clients séparés

---

## 🎯 Changements Majeurs v7

| Élément           | Avant (v6)            | Après (v7)                     |
| ----------------- | --------------------- | ------------------------------ |
| **Provider**      | `prisma-client-js`    | `prisma-client`                |
| **Output**        | `prisma/*/generated/` | `src/generated/*/`             |
| **Import**        | `@prisma/client`      | `../../generated/*/client.js`  |
| **Config**        | `engine: 'classic'`   | Retiré (nouveau par défaut)    |
| **URL**           | Dans `schema.prisma`  | Dans `prisma.config.ts`        |
| **Adaptateur**    | ❌ Non utilisé        | ✅ `@prisma/adapter-pg` requis |
| **Taille client** | ~50 MB (moteurs Rust) | ~5 MB (pur JavaScript)         |

---

## 📝 Plan de Migration (10 Étapes)

### **ÉTAPE 1 : Mettre à jour les dépendances** ⏱️ 2-3 min

```bash
# Prisma 7.0.0
pnpm add -D prisma@7.0.0
pnpm add @prisma/client@7.0.0

# Adaptateur PostgreSQL (NOUVEAU)
pnpm add @prisma/adapter-pg@7.0.0

# Package pg déjà installé ✓

# tsx pour les scripts (recommandé)
pnpm add -D tsx@latest
```

---

### **ÉTAPE 2 : Modifier les 3 fichiers `prisma.config.ts`** ⏱️ 3 min

#### 2.1 - `prisma/cenov/prisma.config.ts`

```diff
  import 'dotenv/config';
  import { defineConfig, env } from 'prisma/config';

  export default defineConfig({
-   engine: 'classic',
+   schema: './schema.prisma',
+
+   migrations: {
+     path: './migrations',
+   },
+
    datasource: {
      url: env('DATABASE_URL')
    },
-   schema: './schema.prisma'
  });
```

#### 2.2 - `prisma/cenov_dev/prisma.config.ts`

```diff
  import 'dotenv/config';
  import { defineConfig, env } from 'prisma/config';

  export default defineConfig({
-   engine: 'classic',
+   schema: './schema.prisma',
+
+   migrations: {
+     path: './migrations',
+   },
+
    datasource: {
      url: env('CENOV_DEV_DATABASE_URL')
    },
-   schema: './schema.prisma'
  });
```

#### 2.3 - `prisma/cenov_preprod/prisma.config.ts`

```diff
  import 'dotenv/config';
  import { defineConfig, env } from 'prisma/config';

  export default defineConfig({
-   engine: 'classic',
+   schema: './schema.prisma',
+
+   migrations: {
+     path: './migrations',
+   },
+
    datasource: {
      url: env('CENOV_PREPROD_DATABASE_URL')
    },
-   schema: './schema.prisma'
  });
```

---

### **ÉTAPE 3 : Modifier les 3 fichiers `schema.prisma`** ⏱️ 5 min

#### 3.1 - `prisma/cenov/schema.prisma`

```diff
  generator client {
-   provider        = "prisma-client-js"
-   previewFeatures = ["views"]
+   provider = "prisma-client"
+   output   = "../../src/generated/cenov"
  }

  datasource db {
    provider = "postgresql"
-   url      = env("DATABASE_URL")
    schemas  = ["produit", "public"]
  }
```

**Changements:**

- Ligne 2: `prisma-client-js` → `prisma-client`
- Ligne 3: Retirer `previewFeatures = ["views"]` (stable en v7)
- Ligne 3 (nouvelle): Ajouter `output = "../../src/generated/cenov"`
- Ligne 8: Retirer `url = env("DATABASE_URL")` (dans prisma.config.ts)

#### 3.2 - `prisma/cenov_dev/schema.prisma`

```diff
  generator cenov_dev_client {
-   provider        = "prisma-client-js"
-   output          = "./generated"
-   previewFeatures = ["views"]
+   provider = "prisma-client"
+   output   = "../../src/generated/cenov_dev"
  }

  datasource cenov_dev_db {
    provider = "postgresql"
-   url      = env("CENOV_DEV_DATABASE_URL")
    schemas  = ["produit", "public"]
  }
```

#### 3.3 - `prisma/cenov_preprod/schema.prisma`

```diff
  generator cenov_preprod_client {
-   provider        = "prisma-client-js"
-   output          = "./generated"
-   previewFeatures = ["views"]
+   provider = "prisma-client"
+   output   = "../../src/generated/cenov_preprod"
  }

  datasource cenov_preprod_db {
    provider = "postgresql"
-   url      = env("CENOV_PREPROD_DATABASE_URL")
    schemas  = ["produit", "public"]
  }
```

---

### **ÉTAPE 4 : Créer `src/generated/` et mettre à jour `tsconfig.json`** ⏱️ 2 min

#### 4.1 - Créer la structure

```bash
# Créer les dossiers
mkdir -p src/generated/cenov
mkdir -p src/generated/cenov_dev
mkdir -p src/generated/cenov_preprod

# Ajouter au gitignore
echo "src/generated/" >> .gitignore
```

#### 4.2 - Modifier `tsconfig.json`

```diff
  {
    "extends": "./.svelte-kit/tsconfig.json",
    "compilerOptions": {
      // ...
-     "module": "es2020",
+     "module": "ESNext",
      "moduleResolution": "bundler"
    },
    "exclude": [
-     "prisma/generated/**/*",
-     "prisma/cenov_dev/generated/**/*",
-     "prisma/cenov_preprod/generated/**/*"
+     "src/generated/**/*"
    ]
  }
```

---

### **ÉTAPE 5 : Générer les nouveaux clients** ⏱️ 3 min

```bash
# Générer les 3 clients
pnpm prisma:generate-all

# Vérifier la génération
ls -la src/generated/cenov/
ls -la src/generated/cenov_dev/
ls -la src/generated/cenov_preprod/
```

**✅ Résultat attendu:** Chaque dossier contient `client.js`, `index.js`, `index.d.ts`

---

### **ÉTAPE 6 : Refactoriser `src/lib/server/db.ts`** ⏱️ 5 min

```diff
+ import 'dotenv/config';
- import { PrismaClient } from '@prisma/client';
+ import { PrismaClient } from '../../generated/cenov/client.js';
+ import { PrismaPg } from '@prisma/adapter-pg';
  import { dev } from '$app/environment';
  import { env } from '$env/dynamic/private';

+ // Créer l'adaptateur PostgreSQL
+ const adapter = new PrismaPg({
+   connectionString: process.env.DATABASE_URL!,
+ });
+
  // Créer le client Prisma avec adaptateur
  const prisma = new PrismaClient({
+   adapter,
    log: ['error', 'warn'],
    errorFormat: 'pretty'
  });

  function useDevTables() {
    return env.USE_DEV_VIEWS === 'true' || dev;
  }

  export { prisma, useDevTables };
```

---

### **ÉTAPE 7 : Refactoriser `src/lib/prisma-meta.ts`** ⏱️ 15 min

#### 7.1 - Nouveaux imports (remplacer lignes 1-62)

```typescript
import 'dotenv/config';
import { browser, dev } from '$app/environment';

// Imports des 3 clients Prisma générés
import { PrismaClient } from '../../generated/cenov/client.js';
import { PrismaClient as CenovDevPrismaClient } from '../../generated/cenov_dev/client.js';
import { PrismaClient as CenovPreprodPrismaClient } from '../../generated/cenov_preprod/client.js';

// Import de l'adaptateur PostgreSQL
import { PrismaPg } from '@prisma/adapter-pg';

// Imports des types DMMF
import type { Prisma } from '../../generated/cenov/client.js';
import type { Prisma as CenovDevPrisma } from '../../generated/cenov_dev/client.js';
import type { Prisma as CenovPreprodPrisma } from '../../generated/cenov_preprod/client.js';
```

#### 7.2 - Retirer les anciennes fonctions d'initialisation

**Supprimer complètement (lignes 19-204):**

- ❌ `interface PrismaModule`
- ❌ Variables globales `Prisma`, `PrismaClient`, `prismaModule`
- ❌ Fonction `initializePrisma()`
- ❌ Variables `CenovDevPrisma`, `CenovDevPrismaClient`
- ❌ Variables `CenovPreprodPrisma`, `CenovPreprodPrismaClient`
- ❌ Fonction `shouldUseDevViews()`
- ❌ Fonction `initializeCenovDevPrisma()`
- ❌ Fonction `initializeCenovPreprodPrisma()`

**Garder directement (ligne 206):**

```typescript
export type DatabaseName = 'cenov' | 'cenov_dev' | 'cenov_preprod';
```

#### 7.3 - Remplacer fonction `createDatabases()` (lignes 253-287)

```typescript
async function createDatabases(): Promise<DatabaseConfig> {
	if (browser) {
		throw new Error('[PRISMA-META] createDatabases ne peut être appelé côté client');
	}

	// Créer les 3 adaptateurs PostgreSQL
	const cenovAdapter = new PrismaPg({
		connectionString: process.env.DATABASE_URL!
	});

	const cenovDevAdapter = new PrismaPg({
		connectionString: process.env.CENOV_DEV_DATABASE_URL!
	});

	const cenovPreprodAdapter = new PrismaPg({
		connectionString: process.env.CENOV_PREPROD_DATABASE_URL!
	});

	return {
		cenov: {
			dmmf: Prisma.dmmf,
			client: new PrismaClient({ adapter: cenovAdapter })
		},
		cenov_dev: {
			dmmf: CenovDevPrisma.dmmf,
			client: new CenovDevPrismaClient({ adapter: cenovDevAdapter })
		},
		cenov_preprod: {
			dmmf: CenovPreprodPrisma.dmmf,
			client: new CenovPreprodPrismaClient({ adapter: cenovPreprodAdapter })
		}
	};
}
```

**⚠️ Tout le reste du fichier reste IDENTIQUE !**

---

### **ÉTAPE 8 : Mettre à jour les scripts BDD-IA** ⏱️ 10 min

**Modifier ces 6 fichiers:**

1. `scripts/BDD-IA/cenov/fetch-cenov-data.mjs`
2. `scripts/BDD-IA/cenov/fetch-cenov-tables.mjs`
3. `scripts/BDD-IA/cenov/fetch-cenov-views.mjs`
4. `scripts/BDD-IA/cenov_dev/fetch-dev-data.mjs`
5. `scripts/BDD-IA/cenov_dev/fetch-dev-tables.mjs`
6. `scripts/BDD-IA/cenov_dev/fetch-dev-views.mjs`

#### Pattern pour scripts CENOV:

```diff
- import { PrismaClient } from '@prisma/client';
+ import 'dotenv/config';
+ import { PrismaClient } from '../../../src/generated/cenov/client.js';
+ import { PrismaPg } from '@prisma/adapter-pg';

+ const adapter = new PrismaPg({
+   connectionString: process.env.DATABASE_URL,
+ });
+
- const prisma = new PrismaClient();
+ const prisma = new PrismaClient({ adapter });
```

#### Pattern pour scripts CENOV_DEV:

```diff
- import { PrismaClient } from '@prisma/client';
+ import 'dotenv/config';
+ import { PrismaClient } from '../../../src/generated/cenov_dev/client.js';
+ import { PrismaPg } from '@prisma/adapter-pg';

+ const adapter = new PrismaPg({
+   connectionString: process.env.CENOV_DEV_DATABASE_URL,
+ });
+
- const prisma = new PrismaClient();
+ const prisma = new PrismaClient({ adapter });
```

---

### **ÉTAPE 9 : Vérifier les autres imports** ⏱️ 5 min

**Fichiers à vérifier (normalement aucune modification):**

Ces fichiers importent depuis `db.ts` ou `prisma-meta.ts`, donc ils continueront de fonctionner:

```typescript
// ✅ Imports OK (pas de modification)
import { prisma } from '$lib/server/db';
import { getClient } from '$lib/prisma-meta';
```

**Liste des fichiers:**

- `src/routes/wordpress/repositories/wordpress.repository.ts`
- `src/routes/export/export-server-logic.ts`
- `src/routes/importV2/+server.ts`
- `src/routes/importV2/+page.server.ts`
- `src/routes/importV2/services/import.orchestrator.ts`
- `src/routes/importV2/repositories/import.repository.ts`
- `src/routes/importV2/services/import.validation.ts`

**Fichier à modifier:**

- `scripts/Script DMMF/extract-dmmf-metadata.mjs` - Vérifier s'il importe directement `@prisma/client`

---

### **ÉTAPE 10 : Tests de validation** ⏱️ 10 min

```bash
# 1. Regénérer tous les clients
pnpm prisma:generate-all

# 2. Vérifier la qualité du code
pnpm lint
pnpm format
pnpm check

# 3. Build du projet
pnpm build

# 4. Tester le dev
pnpm dev

# 5. Tester un script BDD
node scripts/BDD-IA/cenov_dev/fetch-dev-data.mjs

# 6. Tester Prisma Studio
pnpm prisma:studio-dev
```

---

## 🧹 Nettoyage Post-Migration

**Une fois tout testé et validé:**

```bash
# Supprimer les anciens clients générés
rm -rf prisma/cenov_dev/generated
rm -rf prisma/cenov_preprod/generated

# Vérifier qu'il n'y a que src/generated/
find . -name "generated" -type d
```

---

## ⚠️ Points d'Attention

### 1. Extensions `.js` obligatoires

```typescript
// ✅ CORRECT
import { PrismaClient } from '../../generated/cenov/client.js';

// ❌ INCORRECT
import { PrismaClient } from '../../generated/cenov/client';
```

### 2. `dotenv/config` en premier

```typescript
// ✅ CORRECT
import 'dotenv/config';
import { PrismaClient } from '...';

// ❌ INCORRECT
import { PrismaClient } from '...';
import 'dotenv/config';
```

### 3. Types depuis les clients générés

```typescript
// ✅ CORRECT
import type { Prisma } from '../../generated/cenov/client.js';

// ❌ INCORRECT
import type { Prisma } from '@prisma/client';
```

### 4. Ne PAS supprimer `node_modules/@prisma/client`

- Le package reste nécessaire (runtime)
- On ne l'importe plus directement
- Les clients générés en dépendent

---

## 🐛 Problèmes Connus et Solutions

### Erreur: "Module not found: ../../generated/cenov/client.js"

**Solution:** Régénérer les clients

```bash
pnpm prisma:generate-all
```

### Erreur: "exports is not defined"

**Solution:** Vérifier que vous importez depuis `src/generated/` et non `prisma/*/generated/`

### Erreur: "DATABASE_URL is not defined"

**Solution:** Vérifier que `import 'dotenv/config'` est en premier

### Les types ne sont pas reconnus

**Solution:** Vérifier `tsconfig.json` exclut bien `src/generated/`

---

## 📚 Ressources

- [Prisma 7 Announcement](https://www.prisma.io/blog/announcing-prisma-orm-7-0-0)
- [Migration Guide Official](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7)
- [Prisma Config Reference](https://www.prisma.io/docs/orm/reference/prisma-config-reference)
- [Multiple Databases Guide](https://www.prisma.io/docs/guides/multiple-databases)
- [Why Prisma Generates Code into Node Modules](https://www.prisma.io/blog/why-prisma-orm-generates-code-into-node-modules-and-why-it-ll-change)

---

## ✅ Checklist de Migration

- [ ] Étape 1: Dépendances mises à jour
- [ ] Étape 2: 3 `prisma.config.ts` modifiés
- [ ] Étape 3: 3 `schema.prisma` modifiés
- [ ] Étape 4: `src/generated/` créé et `tsconfig.json` mis à jour
- [ ] Étape 5: Clients générés avec succès
- [ ] Étape 6: `db.ts` refactorisé
- [ ] Étape 7: `prisma-meta.ts` refactorisé
- [ ] Étape 8: 6 scripts BDD-IA mis à jour
- [ ] Étape 9: Autres imports vérifiés
- [ ] Étape 10: Tests validés
- [ ] Nettoyage: Anciens `generated/` supprimés

---

**Temps total estimé:** ~1h

**Date de création:** 25 novembre 2024
**Prisma version:** 6.19.0 → 7.0.0
