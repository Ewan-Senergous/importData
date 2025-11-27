<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Card from '$lib/components/ui/card';
	import { Download, Package, AlertCircle, Search } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import { SvelteSet } from 'svelte/reactivity';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let isDownloading = $state(false);

	// État de sélection
	let selectedIds = new SvelteSet<number>();
	let searchQuery = $state('');

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
		console.log('🔵 Téléchargement:', selectedIds.size > 0 ? 'sélection' : 'tous');
		isDownloading = true;

		try {
			const idsParam = selectedIds.size > 0 ? `?ids=${Array.from(selectedIds).join(',')}` : '';

			const response = await fetch(`/wordpress${idsParam}`);
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

	<!-- Card Statistiques -->
	<Card.Root variant="blanc" class="w-full max-w-none">
		<Card.Content>
			<!-- Section Statistiques -->
			<div class="mb-6">
				<h2 class="mb-4 text-xl font-semibold text-black">📊 Base de données CENOV_DEV :</h2>

				<!-- Grille de statistiques -->
				<div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<!-- Total Produits -->
					<div class="rounded-lg border border-blue-200 bg-blue-50 p-4 text-center">
						<div class="text-2xl font-bold text-blue-600">{data.stats.total}</div>
						<div class="text-sm text-blue-800">Produits</div>
					</div>

					<!-- Publiés -->
					<div class="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
						<div class="text-2xl font-bold text-green-600">{data.stats.published}</div>
						<div class="text-sm text-green-800">Publiés</div>
					</div>

					<!-- En stock -->
					<div class="rounded-lg border border-purple-200 bg-purple-50 p-4 text-center">
						<div class="text-2xl font-bold text-purple-600">{data.stats.in_stock}</div>
						<div class="text-sm text-purple-800">En stock</div>
					</div>

					<!-- Sans nom -->
					<div class="rounded-lg border border-orange-200 bg-orange-50 p-4 text-center">
						<div class="text-2xl font-bold text-orange-700">{data.stats.missing_name}</div>
						<div class="text-sm text-orange-800">Sans nom</div>
					</div>
				</div>

				<!-- Avertissements -->
				{#if data.stats.missing_name > 0 || data.stats.missing_price > 0}
					<div class="rounded-lg border border-orange-200 bg-orange-50 p-4">
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

	<!-- Card Sélection des produits -->
	<Card.Root variant="blanc" class="mt-6 w-full max-w-none">
		<Card.Content>
			<h2 class="mb-4 text-xl font-semibold">📋 Sélection des produits :</h2>

			<!-- Barre de recherche + bouton toggle -->
			<div class="mb-4 flex items-center gap-2">
				<div class="relative flex-1">
					<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
					<Input
						type="text"
						placeholder="Rechercher par UGS ou nom..."
						bind:value={searchQuery}
						class="pl-10"
					/>
				</div>
				<Button
					variant={selectedIds.size === filteredProducts.length && filteredProducts.length > 0
						? 'vert'
						: 'noir'}
					onclick={toggleAll}
					class="whitespace-nowrap"
				>
					{selectedIds.size === filteredProducts.length && filteredProducts.length > 0
						? '✓ Tout'
						: '✖ Aucun'}
				</Button>
			</div>

			<!-- Liste des produits avec scroll -->
			<div
				class="mb-4 max-h-[300px] space-y-2 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4"
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
					<p class="py-4 text-center text-sm text-gray-500">Aucun produit trouvé</p>
				{/if}
			</div>

			<!-- Compteur + bouton -->
			<div class="flex items-center justify-between">
				<p class="text-sm text-gray-600">
					<strong>{selectedIds.size}</strong> produit{selectedIds.size > 1 ? 's' : ''} sélectionné{selectedIds.size >
					1
						? 's'
						: ''}
					{#if selectedIds.size === 0}
						<span class="text-gray-500">(tous seront exportés)</span>
					{/if}
				</p>

				<Button variant="vert" onclick={downloadCSV} disabled={isDownloading}>
					<Download class="mr-2 h-5 w-5" />
					{isDownloading ? 'Génération...' : `Télécharger CSV (${selectedIds.size})`}
				</Button>
			</div>

			<!-- Informations complémentaires -->
			<div class="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
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
