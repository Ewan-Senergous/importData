# Plan Export CENOV_DEV vers WordPress

**Date :** 2025-11-20
**Architecture :** Option A - Nouvelle route `/wordpress` dédiée
**Interface :** Style importV2 (Cards, variantes, cohérence UI)
**Difficulté :** 6/10 🟡
**Estimation :** 580 lignes, 6h

## ✅ Décisions Validées

**Champs obligatoires :** Type, UGS, Nom, Publié, Mis en avant ?, Visibilité, Description courte, Description, En stock ?, Tarif régulier, Images, Brand

\*\*Réponses aux questions critiques :

1. ✅ `is_published = false` par défaut (brouillon → activation manuelle)
2. ✅ Si `pro_name` NULL → Utiliser `pro_cenov_id` comme fallback
3. ✅ Exporter première image seulement (plus simple)
4. ✅ `pp_amount` = Prix HT (pas de conversion)
5. ✅ Exclure produits sans `pro_cenov_id` (UGS obligatoire WordPress)

---

## 🏗️ Architecture Finale

```
src/routes/wordpress/
├── +page.svelte                    # Interface UI (style importV2)
├── +page.server.ts                 # Actions (load, download)
├── +server.ts                      # API GET téléchargement direct
│
├── services/                       # 💼 MÉTIER
│   └── wordpress.csv-generator.ts  # Génération CSV WordPress (~150 lignes)
│
└── repositories/                   # 🗄️ DONNÉES
    └── wordpress.repository.ts     # Requêtes BDD (~180 lignes)
```

**Répartition lignes :**

- `+page.svelte` : ~140 lignes (interface Cards style importV2)
- `+page.server.ts` : ~80 lignes (actions load + download)
- `+server.ts` : ~50 lignes (API GET)
- `services/wordpress.csv-generator.ts` : ~150 lignes (génération CSV)
- `repositories/wordpress.repository.ts` : ~180 lignes (SQL + stats)
- **TOTAL : ~600 lignes**

---

## 📝 Étape 1 : Modification Schéma Prisma (1h)

### Fichier : `prisma/cenov_dev/schema.prisma`

**Ajouter 8 champs dans `model product` (après ligne 150) :**

```prisma
model product {
  // ... champs existants ...

  // 🆕 CHAMPS WORDPRESS
  pro_type              String?   @default("simple") @cenov_dev_db.VarChar(20)
  pro_name              String?   @cenov_dev_db.VarChar(255)
  is_published          Boolean   @default(false)
  is_featured           Boolean   @default(false)
  pro_visibility        String    @default("visible") @cenov_dev_db.VarChar(20)
  pro_short_description String?   @cenov_dev_db.Text
  pro_description       String?   @cenov_dev_db.Text
  in_stock              Boolean   @default(true)

  // ... relations ...
}
```

**Valeurs autorisées :**

- `pro_type` : `simple` | `variable` | `grouped` | `external`
- `pro_visibility` : `visible` | `catalog` | `search` | `hidden`

**Commandes :**

```bash
# 1. Modifier schema.prisma (ci-dessus)
# 2. Migration
pnpm prisma:migrate-dev
# 3. Générer client
pnpm prisma:generate-dev
```

---

## 🗄️ Étape 2 : Repository (Requêtes BDD) - 2h

### Fichier : `src/routes/wordpress/repositories/wordpress.repository.ts` (~180 lignes)

```typescript
import { getClient } from '$lib/prisma-meta';
import type { PrismaClient as CenovDevPrismaClient } from '../../../../prisma/cenov_dev/generated';

export interface WordPressProduct {
	type: string;
	sku: string;
	name: string | null;
	published: boolean;
	featured: boolean;
	visibility: string;
	short_description: string | null;
	description: string | null;
	in_stock: boolean;
	regular_price: string | null;
	images: string | null;
	brand: string | null;
}

export async function getProductsForWordPress(): Promise<WordPressProduct[]> {
	const prisma = (await getClient('cenov_dev')) as unknown as CenovDevPrismaClient;

	const products = await prisma.$queryRaw<WordPressProduct[]>`
    SELECT
      COALESCE(p.pro_type, 'simple') AS type,
      p.pro_cenov_id AS sku,
      COALESCE(p.pro_name, p.pro_cenov_id) AS name,
      COALESCE(p.is_published, false) AS published,
      COALESCE(p.is_featured, false) AS featured,
      COALESCE(p.pro_visibility, 'visible') AS visibility,
      p.pro_short_description AS short_description,
      p.pro_description AS description,
      COALESCE(p.in_stock, true) AS in_stock,
      pp.pp_amount::TEXT AS regular_price,
      d.doc_link_source AS images,
      s.sup_label AS brand

    FROM produit.product p

    -- Dernier prix
    LEFT JOIN LATERAL (
      SELECT pp_amount
      FROM produit.price_purchase
      WHERE fk_product = p.pro_id
      ORDER BY pp_date DESC
      LIMIT 1
    ) pp ON true

    -- Première image active
    LEFT JOIN LATERAL (
      SELECT doc_link_source
      FROM public.document
      WHERE product_id = p.pro_id AND is_active = true
      ORDER BY created_at DESC
      LIMIT 1
    ) d ON true

    -- Fournisseur (brand)
    LEFT JOIN public.supplier s ON p.fk_supplier = s.sup_id

    WHERE p.pro_cenov_id IS NOT NULL  -- UGS obligatoire

    ORDER BY p.pro_id ASC;
  `;

	return products;
}

export async function getExportStats() {
	const prisma = (await getClient('cenov_dev')) as unknown as CenovDevPrismaClient;

	const [total, published, in_stock, missing_name, missing_price] = await Promise.all([
		prisma.product.count({ where: { pro_cenov_id: { not: null } } }),
		prisma.product.count({ where: { is_published: true, pro_cenov_id: { not: null } } }),
		prisma.product.count({ where: { in_stock: true, pro_cenov_id: { not: null } } }),
		prisma.product.count({ where: { pro_name: null, pro_cenov_id: { not: null } } }),

		// Produits sans prix
		prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint
      FROM produit.product p
      WHERE p.pro_cenov_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM produit.price_purchase WHERE fk_product = p.pro_id
        )
    `.then((r) => Number(r[0].count))
	]);

	return { total, published, in_stock, missing_name, missing_price };
}
```

---

## 📄 Étape 3 : CSV Generator - 1h

### Fichier : `src/routes/wordpress/services/wordpress.csv-generator.ts` (~150 lignes)

```typescript
import type { WordPressProduct } from '../repositories/wordpress.repository';

const CSV_HEADERS = [
	'Type',
	'UGS',
	'Nom',
	'Publié',
	'Mis en avant ?',
	'Visibilité dans le catalogue',
	'Description courte',
	'Description',
	'En stock ?',
	'Tarif régulier',
	'Images',
	'Brand'
] as const;

function escapeCSV(value: string | null | undefined): string {
	if (value === null || value === undefined) return '';
	const str = String(value);
	if (str.includes('"') || str.includes(',') || str.includes('\n')) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

function generateRow(product: WordPressProduct): string {
	return [
		escapeCSV(product.type),
		escapeCSV(product.sku),
		escapeCSV(product.name),
		product.published ? '1' : '0',
		product.featured ? '1' : '0',
		escapeCSV(product.visibility),
		escapeCSV(product.short_description),
		escapeCSV(product.description),
		product.in_stock ? '1' : '0',
		escapeCSV(product.regular_price),
		escapeCSV(product.images),
		escapeCSV(product.brand)
	].join(',');
}

export function generateWordPressCSV(products: WordPressProduct[]): string {
	const lines = [CSV_HEADERS.join(',')];
	for (const product of products) {
		lines.push(generateRow(product));
	}
	return lines.join('\n');
}
```

**Format CSV attendu :**

```csv
Type,UGS,Nom,Publié,Mis en avant ?,Visibilité dans le catalogue,Description courte,Description,En stock ?,Tarif régulier,Images,Brand
simple,PRO10293502GI-SUP0000002,Pompe à vide RV5,1,0,visible,"Pompe robuste","Description complète",1,1250.00,https://cdn.cenov.fr/RV5.jpg,Elmo Rietschle
```

**Règles :**

- Booléens : `1` (vrai) / `0` (faux)
- Décimaux : `.` comme séparateur
- Texte avec virgules : Échappé avec `""`

---

## 🎨 Étape 4 : Interface Utilisateur - 2h

### Wireframe Style ImportV2

```
┌─────────────────────────────────────────────────────┐
│  🛒 Export WordPress                                │
├─────────────────────────────────────────────────────┤
│  Card (variant="blanc")                             │
│  ┌─────────────────────────────────────────────────┐ │
│  │  📊 Base de données CENOV_DEV                    │ │
│  │  ┌──────────┬──────────┬──────────┬───────────┐ │ │
│  │  │ 1,245    │ 892      │ 1,180    │ 65        │ │ │
│  │  │ Produits │ Publiés  │ En stock │ Sans nom  │ │ │
│  │  └──────────┴──────────┴──────────┴───────────┘ │ │
│  │                                                   │ │
│  │  ⚠️ Avertissements                               │ │
│  │  • 65 produits sans nom (UGS utilisé)            │ │
│  │  • 23 produits sans prix                         │ │
│  │                                                   │ │
│  │  [📥 Télécharger CSV WordPress] (variant="vert") │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Fichier : `src/routes/wordpress/+page.svelte` (~140 lignes)

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/button/Button.svelte';
	import * as Card from '$lib/components/ui/card';
	import { Download, Package, AlertCircle } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';

	let { data } = $props();
	let isDownloading = $state(false);
</script>

<div class="container mx-auto max-w-4xl p-6">
	<h1 class="mb-6 flex items-center gap-2 text-3xl font-bold">
		<Package class="h-8 w-8" />
		Export WordPress
	</h1>

	<Card.Root variant="blanc" class="w-full max-w-none">
		<Card.Content>
			<!-- Statistiques -->
			<div class="mb-6">
				<h2 class="mb-4 text-xl font-semibold text-black">📊 Base de données CENOV_DEV :</h2>

				<div class="mb-6 grid grid-cols-4 gap-4">
					<div class="rounded-lg border border-blue-200 bg-blue-50 p-4 text-center">
						<div class="text-2xl font-bold text-blue-600">{data.stats.total}</div>
						<div class="text-sm text-blue-800">Produits</div>
					</div>
					<div class="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
						<div class="text-2xl font-bold text-green-600">{data.stats.published}</div>
						<div class="text-sm text-green-800">Publiés</div>
					</div>
					<div class="rounded-lg border border-purple-200 bg-purple-50 p-4 text-center">
						<div class="text-2xl font-bold text-purple-600">{data.stats.in_stock}</div>
						<div class="text-sm text-purple-800">En stock</div>
					</div>
					<div class="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-center">
						<div class="text-2xl font-bold text-yellow-600">{data.stats.missing_name}</div>
						<div class="text-sm text-yellow-800">Sans nom</div>
					</div>
				</div>

				<!-- Avertissements -->
				{#if data.stats.missing_name > 0 || data.stats.missing_price > 0}
					<div class="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
						<h3 class="mb-2 flex items-center gap-2 font-medium text-yellow-800">
							<AlertCircle class="h-5 w-5" />
							Avertissements
						</h3>
						<ul class="space-y-1 text-sm text-yellow-700">
							{#if data.stats.missing_name > 0}
								<li>• {data.stats.missing_name} produits sans nom (UGS utilisé comme fallback)</li>
							{/if}
							{#if data.stats.missing_price > 0}
								<li>• {data.stats.missing_price} produits sans prix</li>
							{/if}
						</ul>
					</div>
				{/if}

				<!-- Bouton téléchargement -->
				<form
					method="POST"
					action="?/download"
					use:enhance={() => {
						isDownloading = true;
						return async ({ update, result }) => {
							isDownloading = false;
							if (result.type === 'success') {
								toast.success('CSV WordPress téléchargé avec succès');
							} else if (result.type === 'failure') {
								toast.error('Erreur lors du téléchargement');
							}
							await update();
						};
					}}
				>
					<Button type="submit" variant="vert" class="w-full" disabled={isDownloading}>
						<Download class="mr-2 h-5 w-5" />
						{isDownloading ? 'Génération en cours...' : 'Télécharger CSV WordPress'}
					</Button>
				</form>
			</div>
		</Card.Content>
	</Card.Root>
</div>

<!-- Loader global -->
{#if isDownloading}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
		<div class="rounded-lg bg-white p-6 shadow-lg">
			<div
				class="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"
			></div>
			<p class="text-center font-medium">Génération du CSV...</p>
		</div>
	</div>
{/if}
```

**Éléments UI réutilisés de importV2 :**

- `Card.Root` avec `variant="blanc"`
- Statistiques avec Cards colorées (bleu, vert, purple, yellow)
- Avertissements avec `AlertCircle` icon
- `Button` avec `variant="vert"`
- Loader global identique

---

## 🔧 Étape 5 : Actions SvelteKit - 1h

### Fichier : `src/routes/wordpress/+page.server.ts` (~80 lignes)

```typescript
import { error } from '@sveltejs/kit';
import { protect } from '$lib/auth/protect';
import { getProductsForWordPress, getExportStats } from './repositories/wordpress.repository';
import { generateWordPressCSV } from './services/wordpress.csv-generator';

export const load = async (event) => {
	await protect(event);

	const stats = await getExportStats();

	return { stats };
};

export const actions = {
	download: async (event) => {
		await protect(event);

		try {
			const products = await getProductsForWordPress();
			const csv = generateWordPressCSV(products);

			const timestamp = new Date().toISOString().split('T')[0];
			const filename = `wordpress_products_${timestamp}.csv`;

			return new Response(csv, {
				headers: {
					'Content-Type': 'text/csv; charset=utf-8',
					'Content-Disposition': `attachment; filename="${filename}"`
				}
			});
		} catch (err) {
			console.error('Erreur export WordPress:', err);
			throw error(500, 'Erreur lors de la génération du CSV');
		}
	}
};
```

### Fichier : `src/routes/wordpress/+server.ts` (~50 lignes)

**Alternative : Téléchargement direct via API GET**

```typescript
import { error } from '@sveltejs/kit';
import { protect } from '$lib/auth/protect';
import { getProductsForWordPress } from './repositories/wordpress.repository';
import { generateWordPressCSV } from './services/wordpress.csv-generator';

export async function GET(event) {
	await protect(event);

	try {
		const products = await getProductsForWordPress();
		const csv = generateWordPressCSV(products);

		const timestamp = new Date().toISOString().split('T')[0];
		const filename = `wordpress_products_${timestamp}.csv`;

		return new Response(csv, {
			headers: {
				'Content-Type': 'text/csv; charset=utf-8',
				'Content-Disposition': `attachment; filename="${filename}"`
			}
		});
	} catch (err) {
		console.error('Erreur export WordPress:', err);
		throw error(500, 'Erreur lors de la génération du CSV');
	}
}
```

---

## 📋 Checklist Implémentation

### Phase 1 : Base de Données (1h)

- [ ] Modifier `prisma/cenov_dev/schema.prisma` (ajouter 8 champs)
- [ ] Exécuter `pnpm prisma:migrate-dev`
- [ ] Exécuter `pnpm prisma:generate-dev`
- [ ] Tester connexion Prisma

### Phase 2 : Backend (3h)

- [ ] Créer `repositories/wordpress.repository.ts` (180 lignes)
- [ ] Implémenter `getProductsForWordPress()`
- [ ] Implémenter `getExportStats()`
- [ ] Créer `services/wordpress.csv-generator.ts` (150 lignes)
- [ ] Implémenter `generateWordPressCSV()`

### Phase 3 : Frontend + Actions (2h)

- [ ] Créer `+page.server.ts` (80 lignes)
- [ ] Implémenter action `load`
- [ ] Implémenter action `download`
- [ ] Créer `+server.ts` (50 lignes)
- [ ] Créer `+page.svelte` (140 lignes)

### Phase 4 : Tests Manuels (1h)

- [ ] Tester export 10 produits
- [ ] Valider format CSV WordPress
- [ ] Tester edge cases (sans nom, sans prix)
- [ ] Tester import dans WordPress

**Total : 6h**

---

## ⚠️ Risques Identifiés

### 1. Migration Prisma (Risque ÉLEVÉ 🔴)

- **Problème :** Ajout 8 colonnes sur table `product` production
- **Impact :** Temps migration long si >10k produits
- **Mitigation :** Backup BDD avant migration

### 2. Données Manquantes (Risque MOYEN 🟡)

- **Problème :** Nouveaux champs NULL par défaut
- **Impact :** CSV avec valeurs vides
- **Mitigation :** COALESCE en SQL + fallbacks

### 3. Performance Requête (Risque MOYEN 🟡)

- **Problème :** Jointures multiples (product → price → document → supplier)
- **Impact :** Export lent si >5000 produits
- **Mitigation :** LATERAL JOIN + index existants

### 4. Format CSV WordPress (Risque FAIBLE 🟢)

- **Problème :** Format WooCommerce peut varier
- **Impact :** Import échoue si colonnes incorrectes
- **Mitigation :** Documentation WooCommerce officielle suivie

---

## 🚀 Prochaines Étapes

1. **Backup BDD** - Avant toute migration
2. **Phase 1** - Modification schéma Prisma
3. **Phase 2** - Backend (repository + CSV generator)
4. **Phase 3** - Frontend + actions
5. **Tests WordPress** - Validation import sur instance test
6. **Déploiement** - Après tests réussis

---

**Auteur :** Claude Code
**Version :** 2.0
**Dernière mise à jour :** 2025-11-20
