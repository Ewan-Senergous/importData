<!-- src/lib/components/Filter.svelte modifié -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import * as Select from '$lib/components/ui/select';
	import { Search, CirclePlus, RefreshCcw } from 'lucide-svelte';

	let {
		fields = [],
		placeholder = 'Rechercher ...',
		showAddButton = true,
		addButtonText = 'Ajouter',
		showSortFilter = false,
		hideIdDesc = false
	}: {
		fields?: { key: string; label: string }[];
		placeholder?: string;
		showAddButton?: boolean;
		addButtonText?: string;
		showSortFilter?: boolean;
		hideIdDesc?: boolean;
	} = $props();

	let searchTerm = $state('');
	let selectedField = $state('');
	let sortOrder = $state('asc'); // 'asc' = Ordre naturel de la vue, 'desc' = Ordre inversé, 'id_desc' = Tri par atr_id DESC

	// Initialiser selectedField quand fields change
	$effect(() => {
		if (fields.length > 0 && !selectedField) {
			selectedField = fields[0].key;
		}
	});

	const selectedFieldLabel = $derived(
		fields.find((f) => f.key === selectedField)?.label ?? 'Sélectionner un champ'
	);

	// Éviter les appels automatiques, laisser le Select gérer le changement

	const dispatch = createEventDispatcher();

	function handleSearch() {
		dispatch('filter', {
			field: selectedField,
			term: searchTerm
		});
	}

	function handleReset() {
		searchTerm = '';
		selectedField = fields.length > 0 ? fields[0].key : '';
		sortOrder = 'asc'; // Remettre à 'asc' pour revenir à l'ordre par défaut de la vue
		dispatch('reset');
	}

	function handleAddClick() {
		dispatch('add');
	}

	function handleSortChange() {
		dispatch('sort', {
			order: sortOrder
		});
	}
</script>

<div class="mb-4 flex flex-col gap-3 sm:flex-row">
	<!-- Champ de recherche -->
	<div class="grow">
		<div class="flex flex-col gap-3 sm:flex-row">
			{#if fields.length > 1}
				<div class="w-full sm:w-1/4">
					<Select.Root type="single" bind:value={selectedField}>
						<Select.Trigger class="w-full">
							{selectedFieldLabel}
						</Select.Trigger>
						<Select.Content>
							{#each fields as field (field.key)}
								<Select.Item value={field.key} label={field.label}>
									{field.label}
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			{/if}

			<div class="w-full sm:flex-1">
				<div class="relative">
					<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
						<Search class="h-4 w-4 text-gray-500" />
					</div>
					<Input
						type="search"
						bind:value={searchTerm}
						{placeholder}
						class="w-full pr-20 pl-10"
						onkeyup={(e) => e.key === 'Enter' && handleSearch()}
					/>
					<div class="absolute inset-y-0 right-0 flex items-center pr-1.5">
						<Button variant="bleu" size="xs" onclick={handleSearch}>
							<Search class="h-4 w-4" />
							Rechercher
						</Button>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Groupe avec select de tri et boutons -->
	<div class="flex flex-wrap gap-3 sm:flex-nowrap sm:items-start">
		{#if showSortFilter}
			<div class="w-full sm:w-40">
				<Select.Root
					type="single"
					bind:value={sortOrder}
					onValueChange={(value) => {
						sortOrder = value || 'asc';
						handleSortChange();
					}}
				>
					<Select.Trigger class="w-full">
						{sortOrder === 'asc'
							? '🔤 Ordre par défaut'
							: sortOrder === 'desc'
								? '🔄 Ordre inversé'
								: '🆔 Tri par ID décroissant'}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="asc" label="🔤 Ordre par défaut">🔤 Ordre par défaut</Select.Item>
						<Select.Item value="desc" label="🔄 Ordre inversé">🔄 Ordre inversé</Select.Item>
						{#if !hideIdDesc}
							<Select.Item value="id_desc" label="🆔 Tri par ID décroissant">
								🆔 Tri par ID décroissant
							</Select.Item>
						{/if}
					</Select.Content>
				</Select.Root>
			</div>
		{/if}

		<Button variant="noir" class="flex-1 sm:flex-initial" onclick={handleReset}>
			<RefreshCcw class="mr-2 h-4 w-4" />
			Réinitialiser
		</Button>
		{#if showAddButton}
			<Button variant="vert" class="flex-1 sm:flex-initial" onclick={handleAddClick}>
				<CirclePlus class="mr-2 h-4 w-4" />
				{addButtonText}
			</Button>
		{/if}
	</div>
</div>
