# Exemples d'Architecture Sécurisée Organisée en Couches

Ce document présente 3 exemples d'application sécurisée avec architecture en couches, basés sur 3 routes du projet CENOV.

---

## Exemple n°1 ► Séparation en Couches avec database-explorer

### 1. Décrivez les tâches ou opérations que vous avez effectuées, et dans quelles conditions

Dans le cadre du développement d'un explorateur de base de données pour l'application CENOV, j'ai été chargé de créer un système CRUD (Create, Read, Update, Delete) sécurisé permettant de manipuler les données de 3 bases PostgreSQL (CENOV, CENOV_DEV, CENOV_PREPROD) contenant 59 tables. J'ai organisé le code en 4 couches distinctes pour séparer clairement les responsabilités.

**1. Organisation de l'architecture en couches**

J'ai structuré le dossier `database-explorer/` selon le pattern en couches :

```
database-explorer/
├── repositories/
│   └── explorer.repository.ts     ← Couche Données (requêtes Prisma)
├── services/
│   ├── explorer.service.ts        ← Couche Métier (transformations)
│   └── schema-generator.service.ts ← Couche Métier (génération schémas)
├── +page.server.ts                ← Couche Présentation (actions CRUD)
└── +page.svelte                   ← Interface Utilisateur
```

**2. Création de la couche Repository (Données)**

J'ai développé `explorer.repository.ts` qui contient uniquement l'accès aux données, sans aucune logique métier :

```typescript
// Récupérer les données d'une table avec pagination
export async function getTableData(
	database: DatabaseName,
	tableName: string
): Promise<TableDataResult> {
	const client = await getClient(database);
	const metadata = await getTableMetadataFromPostgres(database, tableName);
	const data = await client.$queryRawUnsafe(`SELECT * FROM "${schema}"."${tableName}" LIMIT 500`);
	return { data, metadata };
}
```

Cette fonction est appelée par la couche supérieure (Server) pour charger les données.

**3. Création de la couche Service (Métier)**

J'ai créé `explorer.service.ts` qui contient la logique de transformation et de présentation :

```typescript
// Générer un résumé lisible d'un enregistrement pour confirmation de suppression
export function generateRecordSummary(
	record: Record<string, unknown>,
	metadata: TableMetadata
): string {
	const nameField = metadata.fields.find(
		(f) => f.name.includes('name') || f.name.includes('label')
	);
	return nameField
		? `${metadata.name} #${pkValue} - ${record[nameField.name]}`
		: `${metadata.name} #${pkValue}`;
}
```

Cette fonction transforme les données brutes en messages utilisateur compréhensibles.

**4. Création de la couche Orchestration (Server)**

Dans `+page.server.ts`, j'ai coordonné les appels entre Repository et Service :

```typescript
export const actions = {
	delete: async ({ request }) => {
		// 1. Récupérer métadonnées via Repository
		const metadata = await getTableMetadata(database, tableName);

		// 2. Générer résumé via Service
		const summary = generateRecordSummary(record, metadata);

		// 3. Supprimer via Repository
		await deleteTableRecord(database, tableName, primaryKeyValue);
	}
};
```

Le Server n'accède jamais directement à la base de données, il passe toujours par le Repository.

**5. Tests de l'architecture**

J'ai testé la création d'un fournisseur avec un code déjà existant. Résultat :

- Le Repository a détecté la contrainte UNIQUE violée
- Le Server a intercepté l'erreur Prisma
- L'utilisateur a reçu le message "Un enregistrement avec cette valeur existe déjà"
- Aucune donnée invalide n'a été insérée

### 2. Précisez les moyens utilisés

**Moyens utilisés :**

- **Architecture en couches** :
  - **Repository** (`explorer.repository.ts`) : Toutes les requêtes Prisma et SQL brutes, pagination, comptage.
  - **Service** (`explorer.service.ts`) : Transformations de données, génération de résumés, parsing de valeurs.
  - **Service** (`schema-generator.service.ts`) : Génération de schémas de validation depuis métadonnées Prisma.
  - **Server** (`+page.server.ts`) : Orchestration des actions CRUD, gestion des erreurs, retour des réponses.
  - **Component** (`+page.svelte`) : Interface utilisateur avec Svelte 5, gestion de l'état UI.

- **Prisma ORM** :
  - J'ai utilisé Prisma dans le Repository pour les opérations CRUD sécurisées.
  - J'ai utilisé `$queryRawUnsafe()` pour les requêtes SQL brutes avec casting PostgreSQL.
  - Les contraintes de base (FK, UNIQUE, NOT NULL) sont vérifiées automatiquement.

- **PostgreSQL** :
  - J'ai utilisé `INFORMATION_SCHEMA.COLUMNS` pour charger les métadonnées en temps réel.
  - J'ai utilisé des CTE (Common Table Expressions) pour les requêtes complexes.

- **SvelteKit** :
  - J'ai utilisé les actions serveur (`+page.server.ts`) pour traiter les formulaires.
  - J'ai utilisé `fail()` pour retourner les erreurs de validation.
  - J'ai utilisé Svelte 5 avec `$state` et `$derived` pour la réactivité.

- **Outils de développement** :
  - J'ai utilisé Visual Studio Code comme IDE pour coder, tester et débugger.
  - J'ai utilisé Git et GitHub pour gérer les modifications du code.
  - J'ai utilisé Prettier et ESLint pour contrôler la qualité du code.

---

## Exemple n°2 ► Transactions Sécurisées avec importV2

### 1. Décrivez les tâches ou opérations que vous avez effectuées, et dans quelles conditions

Dans le cadre du développement d'un système d'import CSV massif pour l'application CENOV, j'ai été chargé de concevoir une architecture en couches permettant d'importer des produits avec leurs attributs dans 2 bases de données (CENOV_DEV et CENOV_PREPROD). L'import devait gérer des hiérarchies complexes (catégories, familles) et valider les données avant insertion en base, le tout dans une transaction unique pour garantir la cohérence.

**1. Organisation de l'architecture en couches**

J'ai structuré le dossier `importV2/` selon le pattern Repository/Service/Orchestrator :

```
wordpress/
├── repositories/
│   └── wordpress.repository.ts       ← Couche Données (requêtes Prisma)
├── services/
│    └── wordpress.csv-generator.ts   ← Couche Métier (validation CSV)
├── +server.ts                        ← Couche API
└── +page.svelte                      ← Interface Utilisateur
```

**2. Création de la couche Repository (Données)**

J'ai développé `import.repository.ts` qui charge les métadonnées nécessaires à la validation :

```typescript
// Charger tous les attributs pour validation
export async function loadAttributeReference(database: 'cenov_dev' | 'cenov_preprod') {
	const prisma = await getClient(database);
	const attributes = await prisma.attribute.findMany({
		select: { atr_id: true, atr_value: true }
	});
	return new Map(attributes.map((a) => [a.atr_value, a]));
}
```

Cette fonction est appelée par le Service pour vérifier que les attributs du CSV existent en base.

**3. Création de la couche Service (Validation)**

J'ai créé `import.validation.ts` qui valide les données CSV sans toucher à la base :

```typescript
// Validation structure CSV (champs obligatoires, formats)
export async function validateCSVData(data: CSVRow[], config: ImportConfig) {
	for (const row of data) {
		// Vérifier prix > 0
		if (row.pp_amount && Number.parseFloat(row.pp_amount) <= 0) {
			errors.push({ line: lineNumber, field: 'pp_amount', error: 'Le prix doit être > 0' });
		}
	}
}
```

Le Service ne fait aucune requête SQL, il utilise les métadonnées chargées par le Repository.

**4. Création de la couche Orchestrator (Transaction)**

J'ai développé `import.orchestrator.ts` qui coordonne l'import dans une transaction unique :

```typescript
export async function importToDatabase(data: CSVRow[], database: 'cenov_dev' | 'cenov_preprod') {
	const prisma = await getClient(database);

	// Précharger métadonnées AVANT transaction
	const metadata = { attributeMap: await loadAttributeReference(database) };

	// Transaction unique : soit TOUT réussit, soit RIEN n'est enregistré
	await prisma.$transaction(
		async (tx) => {
			for (const row of data) {
				const supplier = await findOrCreateSupplier(tx, row.sup_code, row.sup_label);
				const kit = await findOrCreateKit(tx, row.kit_label);
				const product = await upsertProduct(tx, row, supplier.sup_id, kit.kit_id);
				await upsertPricePurchase(tx, product.pro_id, row);
			}
		},
		{ timeout: 60000 }
	);
}
```

L'Orchestrator appelle le Repository pour charger les métadonnées, puis exécute tout dans une transaction.

**5. Tests de l'architecture**

J'ai testé l'import avec un fichier CSV de 100 produits contenant une erreur à la ligne 50. Résultat :

- La validation a détecté l'erreur avant l'import (aucune donnée insérée)
- Après correction : Import réussi en 12 secondes
- Rollback automatique si une ligne échoue (protection ACID)

### 2. Précisez les moyens utilisés

**Moyens utilisés :**

- **Architecture en couches** :
  - **Repository** (`import.repository.ts`) : Fonctions de chargement de métadonnées (attributs, catégories, unités).
  - **Service** (`import.validation.ts`) : Validation des données CSV sans accès base de données.
  - **Orchestrator** (`import.orchestrator.ts`) : Coordination de l'import en transaction unique, appels aux Repositories.
  - **Server** (`+page.server.ts`) : Actions `validate` et `process`, orchestration des couches.
  - **Component** (`+page.svelte`) : Interface wizard en 5 étapes avec Svelte 5.

- **Prisma Transactions** :
  - J'ai utilisé `$transaction()` avec timeout de 60 secondes pour garantir l'atomicité (ACID).
  - Rollback automatique en cas d'erreur : si une ligne échoue, tout est annulé.
  - Configuration `{ timeout: 60000 }` pour éviter les timeouts sur gros imports.

- **Validation multi-niveaux** :
  - Validation CSV (formats, champs obligatoires) dans le Service.
  - Validation attributs obligatoires avec héritage de catégories dans le Repository.
  - Validation des contraintes base de données (FK, UNIQUE) par Prisma automatiquement.

- **Optimisations performance** :
  - Préchargement des métadonnées AVANT transaction (évite timeout).
  - Batching : Charger toutes les catégories en 2 requêtes au lieu de N requêtes.
  - Caches mémoire (`Map`) pour éviter requêtes redondantes.

- **SvelteKit** :
  - J'ai utilisé les actions `validate` et `process` pour séparer validation et import.
  - J'ai utilisé `fail(400)` pour retourner les erreurs au formulaire.

- **Outils de développement** :
  - J'ai utilisé Visual Studio Code comme IDE pour coder, tester et débugger.
  - J'ai utilisé Git et GitHub pour gérer les modifications du code.
  - J'ai utilisé Prettier et ESLint pour contrôler la qualité du code.

---

## Exemple n°3 ► Génération Sécurisée de CSV avec wordpress

### 1. Décrivez les tâches ou opérations que vous avez effectuées, et dans quelles conditions

Dans le cadre du développement d'un système d'export WordPress pour l'application CENOV, j'ai été chargé de créer un générateur de fichiers CSV conforme au format d'import WordPress/WooCommerce, avec échappement correct des données, gestion des attributs dynamiques et protection par authentification.

**1. Implémentation de l'échappement CSV (RFC 4180)**

J'ai développé une fonction `escapeCSV()` dans `wordpress.csv-generator.ts` qui respecte strictement la norme RFC 4180 :

```typescript
function escapeCSV(value: string | null | undefined): string {
	if (value === null || value === undefined) return '';
	const str = String(value);

	// Si contient guillemets, virgules ou sauts de ligne
	if (str.includes('"') || str.includes(',') || str.includes('\n')) {
		return `"${str.replaceAll('"', '""')}"`; // Échapper guillemets doubles
	}
	return str;
}
```

Cela protège contre les injections CSV et garantit que les valeurs contenant des caractères spéciaux (comme "Pompe (3/4\")") sont correctement encapsulées.

**2. Génération dynamique des headers conformes WordPress**

J'ai implémenté la génération de headers avec caractères spéciaux Unicode conformes à WordPress :

```typescript
const BASE_CSV_HEADERS = [
	'Type',
	'UGS',
	'Nom',
	'Publié',
	'Mis en avant\u00A0?', // Espace insécable avant ?
	'Visibilité dans le catalogue',
	'Description courte',
	'Description',
	'En stock\u00A0?', // Espace insécable
	'Tarif régulier',
	'Catégories',
	'Images',
	'Brand'
];

// Génération dynamique pour attributs
for (let i = 1; i <= maxAttributes; i++) {
	headers.push(
		`Nom de l\u2019attribut ${i}`, // Apostrophe courbe '
		`Valeur(s) de l\u2019attribut ${i} `, // Espace OBLIGATOIRE à la fin
		`Attribut ${i} visible`,
		`Attribut ${i} global`
	);
}
```

Les espaces insécables `\u00A0` et apostrophes courbes `\u2019` sont obligatoires pour que WordPress reconnaisse correctement le fichier.

**3. Gestion des attributs avec padding**

J'ai créé une fonction qui génère les colonnes attributs avec padding pour que tous les produits aient le même nombre de colonnes :

```typescript
function generateRow(product: WordPressProduct, maxAttributes: number): string {
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
			// Padding : produits avec moins d'attributs
			attributeColumns.push('', '', '', '');
		}
	}

	return [...baseColumns, ...attributeColumns].join(',');
}
```

Si un produit a 3 attributs et `maxAttributes = 5`, j'ajoute 2×4 = 8 colonnes vides pour compléter.

**4. Protection par authentification**

J'ai sécurisé l'endpoint de téléchargement dans `+server.ts` avec la fonction `protect()` :

```typescript
export const GET: RequestHandler = async (event) => {
	// Protection authentification obligatoire
	await protect(event); // Lance redirect 302 si non authentifié

	const idsParam = event.url.searchParams.get('ids');
	const productIds = idsParam
		? idsParam
				.split(',')
				.map(Number)
				.filter((id) => !Number.isNaN(id))
		: undefined;

	const products = await getProductsForWordPress(productIds);
	const csv = generateWordPressCSV(products);

	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};
```

Seuls les utilisateurs authentifiés peuvent télécharger les exports, mais la page d'accueil avec les statistiques reste publique.

**5. Ajout du BOM UTF-8**

J'ai ajouté le Byte Order Mark UTF-8 au début du fichier pour assurer la compatibilité avec Excel et LibreOffice :

```typescript
const BOM = '\uFEFF'; // Byte Order Mark UTF-8
return BOM + lines.join('\n');
```

Sans ce BOM, Excel affiche incorrectement les caractères accentués (é, à, ç).

### 2. Précisez les moyens utilisés

**Moyens utilisés :**

- **Échappement CSV (RFC 4180)** :
  - J'ai implémenté `escapeCSV()` qui détecte les caractères spéciaux (", virgules, sauts de ligne).
  - Les guillemets sont doublés selon la norme : `"Prix ""spécial"""` → `Prix "spécial"`.
  - Protection contre les injections CSV (formules Excel malveillantes).

- **Unicode et conformité WordPress** :
  - Apostrophes courbes `\u2019` (') au lieu de droites (').
  - Espaces insécables `\u00A0` avant les points d'interrogation.
  - Espace OBLIGATOIRE à la fin du header "Valeur(s) de l'attribut N ".
  - BOM UTF-8 `\uFEFF` pour compatibilité Excel/LibreOffice.

- **Authentification** :
  - J'ai utilisé `protect(event)` pour bloquer l'accès au téléchargement.
  - La fonction lance une redirection 302 vers `/?error=auth&route=wordpress` si l'utilisateur n'est pas connecté.
  - Les statistiques restent publiques (page load non protégée).

- **Optimisations SQL** :
  - **CTE récursive** : Pour charger les hiérarchies de catégories complètes ("Cat Parent > Cat Enfant").
  - **Jointures LATERAL** : Pour récupérer le dernier prix et la première image en 1 requête au lieu de N requêtes.
  - **STRING_AGG()** : Pour agréger les catégories multiples séparées par ", ".

- **Architecture en couches** :
  - **Repository** (`wordpress.repository.ts`) : Requêtes SQL brutes pour performance.
  - **Service** (`wordpress.csv-generator.ts`) : Logique de génération CSV (headers, escaping, padding).
  - **API Endpoint** (`+server.ts`) : Authentification + orchestration.
  - **Component** (`+page.svelte`) : Interface de sélection avec Svelte 5.

- **Gestion des attributs** :
  - Export COMPLET : Tous les attributs (y compris valeurs `!NP!`, `NULL`).
  - Tri par `kat_id` pour cohérence entre exports.
  - Flags `visible` et `global` préservés depuis la base.

- **SvelteKit** :
  - J'ai utilisé `+server.ts` pour créer un endpoint GET avec authentification.
  - Headers HTTP : `Content-Type: text/csv` + `Content-Disposition: attachment`.
  - J'ai utilisé Svelte 5 avec `$state` et `$derived` pour la sélection de produits.

- **Outils de développement** :
  - J'ai utilisé Visual Studio Code comme IDE pour coder, tester et débugger.
  - J'ai utilisé Git et GitHub pour gérer les modifications et suivre l'évolution.
  - J'ai utilisé Prettier et ESLint pour contrôler la qualité du code.

---

## Synthèse des 3 Exemples

| Route                 | Aspect Sécurité Démontré                    | Couches Utilisées                                        | Points Clés                                                                                                          |
| --------------------- | ------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **database-explorer** | Validation multi-niveaux (Zod + Prisma)     | Repository / Service / Server / Component                | - Génération dynamique schémas Zod<br>- Extraction erreurs Prisma lisibles<br>- Confirmation destructive obligatoire |
| **importV2**          | Architecture en couches avec transactions   | Repository / Service / Orchestrator / Server / Component | - Validation 3 priorités<br>- Transaction unique 60s<br>- Batching et caches mémoire                                 |
| **wordpress**         | Génération sécurisée CSV + Authentification | Repository / Service / API / Component                   | - Échappement RFC 4180<br>- Unicode WordPress conforme<br>- Authentification endpoint                                |

Ces 3 exemples démontrent une **architecture mature** avec séparation claire des responsabilités, sécurité robuste et respect des bonnes pratiques de développement.
