<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import {
		Download,
		Package,
		AlertCircle,
		Search,
		Folder,
		RefreshCcw,
		SearchX
	} from 'lucide-svelte';
	import * as Empty from '$lib/components/ui/empty';
	import { toast } from 'svelte-sonner';
	import { SvelteSet } from 'svelte/reactivity';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let isDownloading = $state(false);

	// État de sélection base de données
	let selectedDatabase = $state<'cenov_dev' | 'cenov_preprod'>('cenov_dev');

	// État de sélection
	let selectedIds = new SvelteSet<number>();
	let searchQuery = $state('');

	// États des filtres
	let selectedSupplier = $state<string>('');
	let selectedCategory = $state<string>('');

	// Sync depuis URL params (au mount et navigation)
	$effect(() => {
		selectedDatabase = data.activeFilters.database ?? 'cenov_dev';
		selectedSupplier = data.activeFilters.supplierId?.toString() ?? '';
		selectedCategory = data.activeFilters.categoryId?.toString() ?? '';
	});

	// Labels pour les selects
	let supplierLabel = $derived(
		selectedSupplier
			? (data.suppliers.find((s) => s.sup_id.toString() === selectedSupplier)?.sup_label ??
					'Marque')
			: 'Toutes les marques'
	);
	let categoryLabel = $derived(
		selectedCategory
			? (data.categories.find((c) => c.cat_id.toString() === selectedCategory)?.cat_label ??
					'Catégorie')
			: 'Toutes les catégories'
	);

	// Appliquer les filtres automatiquement (navigation avec paramètres URL)
	const applyFilters = (overrides?: {
		database?: string;
		supplier?: string;
		category?: string;
	}) => {
		const database = overrides?.database ?? selectedDatabase;
		const supplier = overrides?.supplier ?? selectedSupplier;
		const category = overrides?.category ?? selectedCategory;

		const params = new URLSearchParams();
		if (database && database !== 'cenov_dev') params.set('database', database);
		if (supplier) params.set('supplier', supplier);
		if (category) params.set('category', category);

		const queryString = params.toString();
		console.log('🔍 [UI] Filtres appliqués:', { database, supplier, category });
		goto(`/wordpress${queryString ? '?' + queryString : ''}`, { invalidateAll: true });
	};

	// Handler pour changement de base de données (reset les filtres)
	const onDatabaseChange = (db: 'cenov_dev' | 'cenov_preprod') => {
		selectedIds.clear();
		searchQuery = '';
		applyFilters({ database: db, supplier: '', category: '' });
	};

	// Handlers pour changement de filtre (applique immédiatement)
	const onSupplierChange = (value: string) => {
		applyFilters({ supplier: value, category: selectedCategory });
	};

	const onCategoryChange = (value: string) => {
		applyFilters({ supplier: selectedSupplier, category: value });
	};

	// Réinitialiser les filtres (garde la base de données sélectionnée)
	const resetFilters = () => {
		selectedSupplier = '';
		selectedCategory = '';
		searchQuery = '';
		console.log('🔄 [UI] Filtres réinitialisés');
		applyFilters({ supplier: '', category: '' });
	};

	// Filtrer produits selon recherche
	let filteredProducts = $derived(
		data.products.filter(
			(p) =>
				p.pro_cenov_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
				p.pro_name?.toLowerCase().includes(searchQuery.toLowerCase())
		)
	);

	// Toggle sélection individuelle
	const toggleProduct = (id: number) => {
		if (selectedIds.has(id)) {
			selectedIds.delete(id);
		} else {
			selectedIds.add(id);
		}
	};

	// Toggle tout/aucun
	const toggleAll = () => {
		if (selectedIds.size === filteredProducts.length && filteredProducts.length > 0) {
			selectedIds.clear(); // Désélectionner tout
		} else {
			selectedIds.clear();
			filteredProducts.forEach((p) => selectedIds.add(p.pro_id)); // Sélectionner tout
		}
	};

	// Télécharger CSV
	const downloadCSV = async () => {
		console.log(
			'🔵 Téléchargement:',
			selectedIds.size > 0 ? 'sélection' : 'tous',
			'depuis',
			selectedDatabase
		);
		isDownloading = true;

		try {
			const params = new URLSearchParams();
			if (selectedIds.size > 0) params.set('ids', Array.from(selectedIds).join(','));
			if (selectedDatabase !== 'cenov_dev') params.set('database', selectedDatabase);
			const queryString = params.toString();

			const response = await fetch(`/wordpress${queryString ? '?' + queryString : ''}`);
			if (!response.ok) throw new Error(`Erreur: ${response.status}`);

			const blob = await response.blob();
			const url = window.URL.createObjectURL(blob);
			const contentDisposition = response.headers.get('Content-Disposition');
			const filename =
				contentDisposition?.match(/filename="(.+)"/)?.[1] || 'wordpress_products.csv';

			const link = document.createElement('a');
			link.href = url;
			link.download = filename;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			window.URL.revokeObjectURL(url);

			const count = selectedIds.size || data.products.length;
			toast.success(`CSV téléchargé : ${count} produit${count > 1 ? 's' : ''}`);
		} catch (err) {
			console.error('❌ Erreur:', err);
			toast.error('Erreur lors du téléchargement');
		} finally {
			isDownloading = false;
		}
	};
</script>

<svelte:head>
	<title>Export WordPress - CENOV</title>
</svelte:head>

<div class="container mx-auto max-w-4xl p-6">
	<!-- Titre principal -->
	<h1 class="mb-6 flex items-center gap-2 text-3xl font-bold">
		<Package class="h-8 w-8" />
		Export WordPress :
	</h1>

	<!-- Card Sélection des produits -->
	<Card.Root variant="blanc" class="w-full max-w-none">
		<Card.Content>
			<h2 class="mb-4 text-xl font-semibold">📋 Sélection des produits :</h2>

			<!-- Sélection base de données -->
			<Card.Root variant="bleu" class="mb-4 py-4">
				<Card.Content class="px-4">
					<h3 class="mb-2 text-sm font-medium text-blue-700">Base de données cible :</h3>
					<div class="flex gap-4">
						<label class="flex cursor-pointer items-center">
							<input
								type="radio"
								name="database"
								value="cenov_dev"
								checked={selectedDatabase === 'cenov_dev'}
								onchange={() => onDatabaseChange('cenov_dev')}
								class="mr-2"
							/>
							<span class="text-sm">CENOV_DEV ({data.dbTotals.cenov_dev} produits)</span>
						</label>
						<label class="flex cursor-pointer items-center">
							<input
								type="radio"
								name="database"
								value="cenov_preprod"
								checked={selectedDatabase === 'cenov_preprod'}
								onchange={() => onDatabaseChange('cenov_preprod')}
								class="mr-2"
							/>
							<span class="text-sm">CENOV_PREPROD ({data.dbTotals.cenov_preprod} produits)</span>
						</label>
					</div>
				</Card.Content>
			</Card.Root>

			<!-- Filtres Marque & Catégorie -->
			<div
				class="mb-4 flex flex-col gap-3 rounded-lg border border-gray-500 bg-gray-50 p-4 sm:flex-row sm:items-end"
			>
				<div class="flex-1">
					<label class="mb-1 block text-sm font-medium text-black">
						<Package class="mr-1 inline h-4 w-4" />
						Marques :
					</label>
					<Select.Root type="single" bind:value={selectedSupplier} onValueChange={onSupplierChange}>
						<Select.Trigger class="w-full">
							{supplierLabel}
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="" label="Toutes les marques">Toutes les marques</Select.Item>
							{#each data.suppliers as supplier (supplier.sup_id)}
								<Select.Item value={supplier.sup_id.toString()} label={supplier.sup_label}>
									{supplier.sup_label}
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>

				<div class="flex-1">
					<label class="mb-1 block text-sm font-medium text-black">
						<Folder class="mr-1 inline h-4 w-4" />
						Catégories :
					</label>
					<Select.Root type="single" bind:value={selectedCategory} onValueChange={onCategoryChange}>
						<Select.Trigger class="w-full">
							{categoryLabel}
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="" label="Toutes les catégories">Toutes les catégories</Select.Item
							>
							{#each data.categories as category (category.cat_id)}
								<Select.Item value={category.cat_id.toString()} label={category.cat_label}>
									{category.cat_label}
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>

				{#if selectedSupplier || selectedCategory}
					<Button variant="noir" class="font-bold" onclick={resetFilters}>
						<RefreshCcw class="mr-1 h-4 w-4" />
						Reset
					</Button>
				{/if}
			</div>

			<!-- Barre de recherche + checkbox "Sélectionner tout" -->
			<div class="mb-4 flex items-center gap-2">
				<!-- Checkbox "Sélectionner tout (X)" -->
				<label class="flex cursor-pointer items-center gap-2 whitespace-nowrap">
					<input
						type="checkbox"
						checked={selectedIds.size === filteredProducts.length && filteredProducts.length > 0}
						onchange={toggleAll}
						class="h-4 w-4 cursor-pointer"
					/>
					<span class="hidden text-sm font-medium text-gray-700 sm:inline">
						Sélectionner tout ({filteredProducts.length})
					</span>
					<span class="text-sm font-medium text-gray-700 sm:hidden">
						Tout ({filteredProducts.length})
					</span>
				</label>

				<!-- Barre de recherche -->
				<div class="relative flex-1">
					<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
					<!-- Mobile : placeholder court -->
					<Input
						type="text"
						placeholder="Rechercher"
						bind:value={searchQuery}
						class="pl-10 sm:hidden"
					/>
					<!-- Desktop : placeholder complet -->
					<Input
						type="text"
						placeholder="Rechercher par UGS ou nom..."
						bind:value={searchQuery}
						class="hidden pl-10 sm:block"
					/>
				</div>
			</div>

			<!-- Liste des produits avec scroll -->
			<div
				class="mb-4 max-h-75 space-y-2 overflow-y-auto rounded-lg border border-gray-500 bg-gray-50 p-4"
			>
				{#each filteredProducts as product (product.pro_id)}
					<label class="flex cursor-pointer items-center gap-3 rounded p-2 hover:bg-white">
						<input
							type="checkbox"
							checked={selectedIds.has(product.pro_id)}
							onchange={() => toggleProduct(product.pro_id)}
							class="h-4 w-4 cursor-pointer"
						/>
						<span class="text-sm">
							<span class="font-mono font-semibold text-blue-600"
								>{product.pro_cenov_id || 'N/A'}</span
							>
							{#if product.pro_name}
								- <span class="text-gray-700">{product.pro_name}</span>
							{/if}
						</span>
					</label>
				{/each}

				{#if filteredProducts.length === 0}
					<Empty.Root class="border-none bg-transparent">
						<Empty.Header>
							<Empty.Media variant="icon">
								<SearchX class="h-6 w-6" />
							</Empty.Media>
							<Empty.Title>Aucun produit trouvé</Empty.Title>
							<Empty.Description>
								{#if searchQuery}
									Aucun résultat pour "{searchQuery}"
								{:else if selectedSupplier || selectedCategory}
									Aucun produit ne correspond aux filtres sélectionnés
								{:else}
									Aucun produit disponible
								{/if}
							</Empty.Description>
						</Empty.Header>
					</Empty.Root>
				{/if}
			</div>

			<!-- Compteur + bouton -->
			<div class="flex items-center justify-between">
				<p class="text-sm text-gray-600">
					<strong>{selectedIds.size}</strong> produit{selectedIds.size > 1 ? 's' : ''} sélectionné{selectedIds.size >
					1
						? 's'
						: ''}
				</p>

				<Button variant="vert" class="font-bold" onclick={downloadCSV} disabled={isDownloading}>
					<Download class="mr-2 h-5 w-5" />
					{isDownloading ? 'Génération...' : `Télécharger CSV (${selectedIds.size})`}
				</Button>
			</div>

			<!-- Informations complémentaires -->
			<div class="mt-6 rounded-lg border border-gray-500 bg-gray-50 p-4">
				<h3 class="mb-2 text-sm font-semibold text-gray-700">ℹ️ Informations :</h3>
				<ul class="space-y-1 text-xs text-gray-600">
					<li>• Format : CSV compatible WooCommerce</li>
					<li>
						• Champs exportés : Type, UGS, Nom, Publié, Visibilité, Descriptions, Prix, Images,
						Brand
					</li>
					<li>• Produits avec UGS uniquement (requis par WordPress)</li>
					<li>• Champ nom vide si non renseigné</li>
					<li>• Sélection vide = export de tous les produits</li>
				</ul>
			</div>
		</Card.Content>
	</Card.Root>

	<!-- Card Statistiques -->
	<Card.Root variant="blanc" class="mt-6 w-full max-w-none">
		<Card.Content>
			<!-- Section Statistiques -->
			<div class="mb-6">
				<h2 class="mb-4 text-xl font-semibold text-black">
					📊 Base de données {selectedDatabase.toUpperCase()} :
				</h2>

				<!-- Grille de statistiques -->
				<div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<!-- Total Produits -->
					<div class="rounded-lg border border-blue-500 bg-blue-50 p-4 text-center">
						<div class="text-2xl font-bold text-blue-600">{data.stats.total}</div>
						<div class="text-sm text-blue-800">Produits</div>
					</div>

					<!-- Publiés -->
					<div class="rounded-lg border border-green-500 bg-green-50 p-4 text-center">
						<div class="text-2xl font-bold text-green-600">{data.stats.published}</div>
						<div class="text-sm text-green-800">Publiés</div>
					</div>

					<!-- En stock -->
					<div class="rounded-lg border border-purple-500 bg-purple-50 p-4 text-center">
						<div class="text-2xl font-bold text-purple-600">{data.stats.in_stock}</div>
						<div class="text-sm text-purple-800">En stock</div>
					</div>

					<!-- Sans nom -->
					<div class="rounded-lg border border-orange-500 bg-orange-50 p-4 text-center">
						<div class="text-2xl font-bold text-orange-700">{data.stats.missing_name}</div>
						<div class="text-sm text-orange-800">Sans nom</div>
					</div>
				</div>

				<!-- Avertissements -->
				{#if data.stats.missing_name > 0 || data.stats.missing_price > 0}
					<div class="rounded-lg border border-orange-500 bg-orange-50 p-4">
						<h3 class="mb-2 flex items-center gap-2 font-medium text-orange-800">
							<AlertCircle class="h-5 w-5" />
							Avertissements
						</h3>
						<ul class="space-y-1 text-sm text-orange-700">
							{#if data.stats.missing_name > 0}
								<li>• {data.stats.missing_name} produits sans nom (champ vide)</li>
							{/if}
							{#if data.stats.missing_price > 0}
								<li>• {data.stats.missing_price} produits sans prix</li>
							{/if}
						</ul>
					</div>
				{/if}
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
