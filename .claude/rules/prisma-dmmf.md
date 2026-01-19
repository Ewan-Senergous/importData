# Principe Anti-Hardcoding Prisma DMMF

**RÈGLE :** Utiliser métadonnées Prisma DMMF au lieu de hardcoder les données DB.

## Exemples

### ❌ MAUVAIS - Hardcoding

```typescript
// Hardcoding des bases
const databases = ['cenov', 'cenov_dev'];

// Hardcoding de schémas
if (schema !== 'public' && schema !== 'produit') throw new Error('Invalide');

// Hardcoding d'ordre de tri
if (database === 'cenov') return 1;
if (database === 'cenov_dev') return 2;
```

### ✅ BON - Utiliser DMMF

```typescript
// Récupérer dynamiquement
const databases = await getAllDatabaseNames();

// Détecter schéma via métadonnées
const metadata = await getTableMetadata(database, tableName);
const schema = metadata.schema || 'public';

// Tri alphabétique
return a.database.localeCompare(b.database);
```

## Fonctions DMMF (`src/lib/prisma-meta.ts`)

### 1. `getAllDatabaseNames()`

Liste des bases configurées.

```typescript
const dbNames = await getAllDatabaseNames();
// ['cenov', 'cenov_dev', 'cenov_preprod']

if (!dbNames.includes(requestedDb)) throw new Error('Invalide');
```

### 2. `getTableMetadata(database, tableName)`

Détection automatique du schéma.

```typescript
const metadata = await getTableMetadata('cenov', 'kit');
console.log(metadata.schema); // 'public'

const query = `SELECT * FROM "${metadata.schema}"."${metadata.tableName}"`;
```

### 3. `getAllTables(database)`

Liste tables avec schéma.

```typescript
const tables = await getAllTables('cenov');
// [{ name: 'kit', schema: 'public' }, ...]

for (const table of tables) {
	const query = `SELECT * FROM "${table.schema}"."${table.name}"`;
}
```

### 4. `getAllDatabaseTables()`

Tables de toutes les bases.

```typescript
const allTables = await getAllDatabaseTables();
// [{ database: 'cenov', name: 'kit', schema: 'public' }, ...]

allTables.sort((a, b) => a.database.localeCompare(b.database));
```

### 5. `getDatabases()`

Accès clients Prisma et métadonnées.

```typescript
const databases = getDatabases();
const { client, dmmf, name } = databases.cenov;
const kits = await client.kit.findMany();
```

## Cas d'Usage

```typescript
// ❌ MAUVAIS - Validation hardcodée
if (db !== 'cenov' && db !== 'cenov_dev') throw new Error('Invalide');

// ✅ BON - Validation dynamique
const validDatabases = await getAllDatabaseNames();
if (!validDatabases.includes(db)) throw new Error('Invalide');

// ❌ MAUVAIS - Schéma hardcodé
if (table === 'produit') return 'produit';
return 'public';

// ✅ BON - Détection schéma
const metadata = await getTableMetadata(database, table);
return metadata.schema || 'public';
```

## Exceptions : Config UI

Hardcoding acceptable pour UI uniquement :

```typescript
// ✅ OK - Config UI
export const DATABASE_CONFIG = {
	cenov: { icon: RocketIcon, variant: 'bleu', label: 'Production' },
	cenov_dev: { icon: CodeIcon, variant: 'vert', label: 'Développement' }
};

// ✅ OK - Valeur par défaut SQL standard
const schema = metadata.schema || 'public';
```

**Acceptable :** Icônes, couleurs, labels UI, valeurs par défaut standards.

## Checklist

Avant de hardcoder une valeur DB :

- [ ] Peut-elle être récupérée via DMMF ?
- [ ] Y a-t-il une fonction `prisma-meta.ts` ?
- [ ] Est-ce logique métier ou config UI ?
- [ ] Le code cassera si on ajoute une base ?
- [ ] Le code cassera si on change le schéma ?

**Si 2+ "oui" → Utiliser DMMF !**

## Règle d'Or

**Données DB → Prisma DMMF | UI/Config → Fichier centralisé**
