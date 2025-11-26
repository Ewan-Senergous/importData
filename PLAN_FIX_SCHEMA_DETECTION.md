# Plan de Correction: Détection Schéma en Production

## 🔴 Problème

**Symptôme**: En PROD, seul le schéma "public" est détecté au lieu de "public" + "produit"

**Erreur**:
```
Error: ENOENT: no such file or directory, open 'C:\...\\.svelte-kit\\output\\prisma\\cenov\\schema.prisma'
```

**Cause**: Le code lit `schema.prisma` depuis le disque, mais les chemins sont incorrects après le build.

## ✅ Solution Retenue: process.cwd() au lieu de import.meta.url

**Problème identifié**: L'import dynamique ne fonctionne pas car `config` n'est pas exporté par les modules générés.

**Vraie cause**: `import.meta.url` résout mal les chemins en production (bundle dans `.svelte-kit/output/`).

**Solution**: Utiliser `process.cwd()` qui pointe toujours vers la racine du projet en DEV et PROD.

## 📋 Étape d'Implémentation (UNE SEULE)

### Remplacer import.meta.url par process.cwd()

**Fichier à modifier**: `src/lib/prisma-meta.ts`

**Localisation**: Fonction `createDatabases()` lignes 210-228

**Code actuel (BUGGY)**:
```typescript
// Import dynamique - NE MARCHE PAS car config n'est pas exporté
const cenovModule = await import('../generated/prisma-cenov/internal/class.js');
const devModule = await import('../generated/prisma-cenov-dev/internal/class.js');
const preprodModule = await import('../generated/prisma-cenov-preprod/internal/class.js');

console.log('[PRISMA-META DEBUG] cenovModule keys:', Object.keys(cenovModule));
// Résultat: [ 'getPrismaClientClass' ] - PAS de 'config' !

const cenovSchema = ((cenovModule as Record<string, unknown>).config as { inlineSchema?: string })?.inlineSchema || '';
// Résultat: cenovSchema length: 0 - VIDE !
```

**REMPLACER PAR** (13 lignes):
```typescript
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
    devSchema = await fs.readFile(path.join(projectRoot, 'prisma/cenov_dev/schema.prisma'), 'utf-8');
    preprodSchema = await fs.readFile(path.join(projectRoot, 'prisma/cenov_preprod/schema.prisma'), 'utf-8');
    console.log('[PRISMA-META] Schémas chargés avec succès depuis:', projectRoot);
} catch (error) {
    console.warn('[PRISMA-META] Erreur lecture schema.prisma depuis', projectRoot, ':', error);
}
```

**Différence clé**:
- ❌ `import.meta.url` → Chemin incorrect en PROD (`.svelte-kit/output/`)
- ✅ `process.cwd()` → Racine projet correcte en DEV et PROD

## 🧪 Tests

### 1. Test DEV
```bash
pnpm dev
```
Vérifier: Page `/export` charge, détecte "public" et "produit"

### 2. Test BUILD
```bash
pnpm build
```
Vérifier: Pas d'erreurs TypeScript/Vite

### 3. Test PROD (CRITIQUE)
```bash
pnpm preview
```
Vérifier:
- Page `/export` fonctionne
- Détecte les schémas "public" ET "produit"
- Aucune erreur `ENOENT` dans la console

## 📊 Résumé des Changements

| Avant | Après |
|-------|-------|
| `import.meta.url` + résolution relative | `process.cwd()` direct |
| Chemin incorrect en PROD | Chemin correct DEV + PROD |
| Échoue en PROD | Fonctionne DEV + PROD |
| `fileURLToPath`, `path.resolve`, `__dirname` | Juste `process.cwd()` |

## ✅ Critères de Succès

- ✅ Détection correcte "public" + "produit" en PROD
- ✅ Aucune erreur `ENOENT` dans les logs
- ✅ Comportement identique DEV et PROD
- ✅ Page `/export` fonctionnelle
- ✅ **Aucune modification de fichiers auto-générés**

## 🎯 Avantages de la Solution

1. **Simplicité**: Changement minimal - remplacer 1 ligne (`import.meta.url` → `process.cwd()`)
2. **Fiabilité**: `process.cwd()` est stable et documenté Node.js
3. **Universalité**: Fonctionne identiquement en DEV, BUILD, et PROD
4. **Maintenabilité**: Solution standard, pas de hack
5. **Pas de dépendance**: Pas besoin d'exports supplémentaires

## 📍 Fichiers Impactés

### À Modifier (1 seul)
- `src/lib/prisma-meta.ts` lignes 210-228

### Sources (utilisés, NON modifiés)
- `prisma/cenov/schema.prisma` - Lu depuis `process.cwd()`
- `prisma/cenov_dev/schema.prisma` - Lu depuis `process.cwd()`
- `prisma/cenov_preprod/schema.prisma` - Lu depuis `process.cwd()`
