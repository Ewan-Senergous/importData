<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { Modal } from 'flowbite-svelte';
	import ExplorerSidebar from './services/ExplorerSidebar.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import {
		Loader2,
		CirclePlus,
		CircleCheck,
		CircleX,
		Trash2,
		Database,
		CheckSquare,
		Square
	} from 'lucide-svelte';
	import type { PageData } from './$types';
	import type { TableSelection } from './services/explorer.service';
	import type { TableMetadata } from './repositories/explorer.repository';
	import { generateRecordSummary } from './services/explorer.service';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	// ===== ÉTATS PRINCIPAUX =====
	let selectedTable = $state<TableSelection | null>(null);
	let tableData = $state<Record<string, unknown>[]>([]);
	let tableMetadata = $state<TableMetadata | null>(null);
	let totalRows = $state(0);
	let currentPage = $state(1);
	const pageSize = 500;

	// ===== ÉTATS UI =====
	let modalState = $state<{
		mode: 'create' | 'edit' | 'delete' | null;
		record: Record<string, unknown> | null;
	}>({ mode: null, record: null });

	let isLoading = $state(false);
	let deleteConfirmation = $state('');

	// États pour les modales
	let isCreateEditModalOpen = $state(false);
	let isDeleteModalOpen = $state(false);

	// États pour la sélection multiple
	let selectedItems = $state<Record<string, unknown>[]>([]);
	let selectAll = $state(false);

	// AbortController pour annuler les requêtes en cours
	let abortController: AbortController | null = null;

	// ===== DERIVED STATES =====
	let isReadOnly = $derived(tableMetadata?.category === 'view');
	let totalPages = $derived(Math.ceil(totalRows / pageSize));
	// Afficher TOUS les champs dans le modal (comme dans le tableau)
	// Mais on désactivera l'édition pour les champs auto-générés
	let displayedFields = $derived(tableMetadata?.fields || []);
	let selectedCount = $derived(selectedItems.length);
	let hasSelection = $derived(selectedCount > 0);

	// ===== EFFETS =====
	// Charger les données quand la table sélectionnée change
	$effect(() => {
		if (selectedTable) {
			// Réinitialiser la sélection
			selectedItems = [];
			selectAll = false;

			loadTableData();
			// Reset scroll à 0 quand on change de table
			const container = document.querySelector('.h-full.overflow-auto.p-6');
			if (container) {
				container.scrollTop = 0;
			}
		}
	});

	// ===== HANDLERS =====
	async function loadTableData() {
		if (!selectedTable) {
			return;
		}

		// Annuler la requête précédente si elle existe
		if (abortController) {
			abortController.abort();
		}

		// Créer un nouveau AbortController pour cette requête
		abortController = new AbortController();
		const currentAbortController = abortController;

		isLoading = true;

		try {
			const response = await fetch('/database-explorer/api/load-table', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					database: selectedTable.database,
					schema: selectedTable.schema,
					tableName: selectedTable.tableName,
					page: currentPage
				}),
				signal: currentAbortController.signal // ✅ Annulation possible
			});

			const result = await response.json();

			// Vérifier que cette requête n'a pas été annulée
			if (currentAbortController.signal.aborted) {
				return;
			}

			if (result.success) {
				tableData = result.data || [];
				tableMetadata = result.metadata;
				totalRows = result.total || 0;
			} else {
				toast.error(result.error || 'Erreur lors du chargement de la table');
			}
		} catch (error) {
			// Ignorer les erreurs d'annulation
			if (error instanceof Error && error.name === 'AbortError') {
				return;
			}

			console.error('❌ Erreur lors du chargement:', error);
			toast.error('Erreur lors du chargement de la table');
		} finally {
			// Ne réinitialiser isLoading que si cette requête n'a pas été annulée
			if (!currentAbortController.signal.aborted) {
				isLoading = false;
			}
		}
	}

	function handleTableSelect(event: CustomEvent<TableSelection>) {
		selectedTable = event.detail;
		currentPage = 1;
	}

	function openCreateModal() {
		modalState = { mode: 'create', record: null };
		isCreateEditModalOpen = true;
	}

	function closeModal() {
		isCreateEditModalOpen = false;
		isDeleteModalOpen = false;
		modalState = { mode: null, record: null };
		deleteConfirmation = '';
	}

	function goToPage(page: number) {
		if (page >= 1 && page <= totalPages) {
			currentPage = page;
			// Réinitialiser la sélection lors du changement de page
			selectedItems = [];
			selectAll = false;
			loadTableData();
		}
	}

	function handleSelectAll() {
		selectAll = !selectAll;
		if (selectAll) {
			selectedItems = [...tableData];
		} else {
			selectedItems = [];
		}
	}

	function handleSelect(item: Record<string, unknown>) {
		if (selectedItems.includes(item)) {
			selectedItems = selectedItems.filter((i) => i !== item);
		} else {
			selectedItems = [...selectedItems, item];
		}
		selectAll = selectedItems.length === tableData.length;
	}

	async function handleDeleteSelected() {
		if (!selectedItems.length || !tableMetadata) return;

		const confirmText = `Supprimer ${selectedCount} enregistrement(s) ? Cette action est irréversible.`;
		if (!confirm(confirmText)) return;

		try {
			const formData = new FormData();
			formData.append('database', selectedTable!.database);
			formData.append('tableName', selectedTable!.tableName);
			formData.append(
				'primaryKeyValues',
				JSON.stringify(selectedItems.map((r) => r[tableMetadata!.primaryKey]))
			);

			// ✅ Une seule requête avec transaction atomique
			const response = await fetch('?/deleteMultiple', {
				method: 'POST',
				body: formData
			});

			const result = await response.json();

			if (response.ok && result.type === 'success') {
				toast.success(`${selectedCount} enregistrement(s) supprimé(s) avec succès`);
				selectedItems = [];
				selectAll = false;
				await loadTableData();
			} else {
				toast.error(result.data?.error || 'Erreur lors de la suppression');
			}
		} catch (error) {
			console.error('❌ Erreur lors de la suppression multiple:', error);
			toast.error('Erreur lors de la suppression multiple');
		}
	}

	// Formater la valeur pour affichage (données brutes)
	function formatValue(value: unknown): string {
		if (value === null || value === undefined) {
			return '';
		}
		// Les timestamps sont maintenant retournés comme strings brutes depuis la BDD
		return String(value);
	}
</script>

<Sidebar.Provider>
	<Sidebar.Sidebar>
		<ExplorerSidebar allTables={data.allTables} on:tableSelect={handleTableSelect} />
	</Sidebar.Sidebar>
	<Sidebar.SidebarInset>
		<div class="h-full overflow-auto p-6">
			{#if !selectedTable}
				<!-- Message de sélection -->
				<div class="flex h-full items-center justify-center">
					<Card.Root class="max-w-lg">
						<Card.Header>
							<Card.Title class="flex items-center gap-2 text-xl">
								<Database class="size-6" />
								Database Explorer
							</Card.Title>
							<Card.Description class="text-base">
								Sélectionnez une table ou une vue dans la barre latérale pour visualiser ses données
							</Card.Description>
						</Card.Header>
					</Card.Root>
				</div>
			{:else}
				<!-- En-tête de la table -->
				<div class="mb-4">
					<div class="mb-2 flex items-center justify-between">
						<h1 class="text-2xl font-bold">
							{selectedTable.tableName}
						</h1>
					</div>
					<div class="flex items-center justify-between">
						<p class="text-muted-foreground text-sm">
							{selectedTable.database} • {selectedTable.schema}
							{#if isReadOnly}
								<Badge variant="vert" class="ml-2">Lecture seule</Badge>
							{/if}
						</p>
						{#if !isReadOnly}
							<div class="flex gap-2">
								<Button variant="vert" onclick={openCreateModal}>
									<CirclePlus class="mr-2 h-4 w-4" />
									Ajouter
								</Button>
								<Button variant="rouge" disabled={!hasSelection} onclick={handleDeleteSelected}>
									<Trash2 class="mr-2 h-4 w-4" />
									Supprimer ({selectedCount})
								</Button>
							</div>
						{/if}
					</div>
				</div>

				<!-- Table de données -->
				{#if isLoading}
					<div class="flex items-center justify-center py-12">
						<Loader2 class="text-primary size-8 animate-spin" />
					</div>
				{:else if tableData.length === 0}
					<div class="relative overflow-x-auto">
						<table class="w-full border-x border-black text-left text-sm">
							<thead class="bg-blue-700 text-xs text-white uppercase">
								<tr>
									{#if !isReadOnly}
										<th scope="col" class="w-14 border-x border-black px-4 py-3">
											<span class="sr-only">Select</span>
										</th>
									{/if}
									{#if tableMetadata}
										{#each tableMetadata.fields as field, fieldIndex (fieldIndex)}
											<th
												scope="col"
												class="w-14 border-x border-black px-4 py-3 whitespace-nowrap"
											>
												{field.name}
											</th>
										{/each}
									{/if}
								</tr>
							</thead>
							<tbody>
								<tr>
									<td
										colspan={tableMetadata ? tableMetadata.fields.length + (isReadOnly ? 0 : 1) : 1}
										class="text-muted-foreground border-x border-black bg-white px-4 py-12 text-center"
									>
										<div class="flex flex-col items-center gap-2">
											<Database class="size-12 text-gray-300" />
											<p class="text-base font-medium">Aucune donnée disponible</p>
											<p class="text-sm">
												Cette table ne contient aucun enregistrement pour le moment
											</p>
										</div>
									</td>
								</tr>
							</tbody>
						</table>
					</div>
				{:else}
					<div class="relative overflow-x-auto">
						<table class="w-full border-x border-black text-left text-sm">
							<thead class="bg-blue-700 text-xs text-white uppercase">
								<tr>
									{#if !isReadOnly}
										<th scope="col" class="w-14 border-x border-black px-4 py-3">
											<button
												class="flex items-center"
												onclick={handleSelectAll}
												title={selectAll ? 'Désélectionner tout' : 'Sélectionner tout'}
											>
												{#if selectAll}
													<CheckSquare class="h-4 w-4" />
												{:else}
													<Square class="h-4 w-4" />
												{/if}
											</button>
										</th>
									{/if}
									{#if tableMetadata}
										{#each tableMetadata.fields as field, fieldIndex (fieldIndex)}
											<th
												scope="col"
												class="w-14 border-x border-black px-4 py-3 whitespace-nowrap"
											>
												{field.name}
											</th>
										{/each}
									{/if}
								</tr>
							</thead>
							<tbody>
								{#each tableData as record, i (i)}
									<tr class="group border-b" class:bg-blue-100={selectedItems.includes(record)}>
										{#if !isReadOnly}
											<td
												class="w-14 border-x border-black px-4 py-3 {i % 2 === 0
													? 'bg-white'
													: 'bg-gray-100'}"
											>
												<input
													type="checkbox"
													class="h-4 w-4 rounded text-blue-600"
													checked={selectedItems.includes(record)}
													onchange={() => handleSelect(record)}
													aria-label="Sélectionner cet élément"
												/>
											</td>
										{/if}
										{#if tableMetadata}
											{#each tableMetadata.fields as field, fieldIndex (fieldIndex)}
												<td
													class="w-14 border-x border-black px-4 py-3 {i % 2 === 0
														? 'bg-white'
														: 'bg-gray-100'}"
												>
													{formatValue(record[field.name])}
												</td>
											{/each}
										{/if}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

					<!-- Pagination -->
					{#if totalPages > 1}
						<div class="mt-4 flex items-center justify-between">
							<p class="text-muted-foreground text-sm">
								Page {currentPage} sur {totalPages} ({totalRows} enregistrements)
							</p>
							<div class="flex gap-2">
								<Button
									variant="blanc"
									size="sm"
									disabled={currentPage === 1}
									onclick={() => goToPage(currentPage - 1)}
								>
									Précédent
								</Button>
								<Button
									variant="blanc"
									size="sm"
									disabled={currentPage === totalPages}
									onclick={() => goToPage(currentPage + 1)}
								>
									Suivant
								</Button>
							</div>
						</div>
					{/if}
				{/if}
			{/if}
		</div>
	</Sidebar.SidebarInset>
</Sidebar.Provider>

<!-- Modal Create/Edit -->
<Modal bind:open={isCreateEditModalOpen} size="lg">
	<h3 class="mb-4 text-lg font-bold text-gray-900">
		{modalState.mode === 'create' ? 'Créer un enregistrement' : 'Modifier un enregistrement'}
	</h3>
	<form
		method="POST"
		action="?/{modalState.mode}"
		use:enhance={() => {
			return async ({ result, update }) => {
				if (result.type === 'success') {
					toast.success(
						modalState.mode === 'create'
							? 'Enregistrement créé avec succès'
							: 'Enregistrement modifié avec succès'
					);
					closeModal();
					await loadTableData();
				} else if (result.type === 'failure') {
					toast.error(String(result.data?.error) || 'Une erreur est survenue');
				}
				await update();
			};
		}}
	>
		{#if selectedTable && tableMetadata}
			<input type="hidden" name="database" value={selectedTable.database} />
			<input type="hidden" name="tableName" value={selectedTable.tableName} />
			{#if modalState.mode === 'edit' && modalState.record}
				<input
					type="hidden"
					name="primaryKeyValue"
					value={String(modalState.record[tableMetadata.primaryKey])}
				/>
			{/if}

			<div class="grid grid-cols-2 gap-4">
				{#each displayedFields as field (field.name)}
					{@const isAutoGenerated =
						field.isPrimaryKey ||
						(field.hasDefaultValue && modalState.mode === 'create') ||
						field.isUpdatedAt}
					{@const isDisabled = isAutoGenerated}
					{@const isRequiredForUser =
						field.isRequired && !field.hasDefaultValue && !field.isPrimaryKey && !field.isUpdatedAt}
					<div class="w-full">
						<Label for={field.name}>
							{field.name}
							{#if isRequiredForUser}
								<span class="text-red-600">*</span>
							{/if}
							{#if isAutoGenerated}
								<Badge variant="noir" class="ml-2 text-xs">Auto</Badge>
							{/if}
						</Label>
						<Input
							id={field.name}
							name={field.name}
							type={field.type === 'DateTime' ? 'datetime-local' : 'text'}
							required={isRequiredForUser}
							disabled={isDisabled}
							value={field.type === 'DateTime' && modalState.record?.[field.name]
								? new Date(modalState.record[field.name] as string).toISOString().slice(0, 16)
								: modalState.record
									? formatValue(modalState.record[field.name])
									: ''}
							class={isDisabled ? 'bg-muted cursor-not-allowed' : ''}
						/>
						<p class="text-muted-foreground text-xs">
							Type: {field.type}
							{#if isAutoGenerated}
								(généré automatiquement)
							{:else}
								{isRequiredForUser ? ' (requis)' : ' (optionnel)'}
							{/if}
						</p>
					</div>
				{/each}
			</div>

			<div class="col-span-2 flex justify-end space-x-2 pt-4">
				<Button type="button" variant="noir" onclick={closeModal}>
					<CircleX class="mr-2 h-4 w-4" />
					Annuler
				</Button>
				<Button type="submit" variant="vert">
					<CircleCheck class="mr-2 h-4 w-4" />
					{modalState.mode === 'create' ? 'Créer' : 'Modifier'}
				</Button>
			</div>
		{/if}
	</form>
</Modal>

<!-- Modal Delete -->
<Modal bind:open={isDeleteModalOpen} size="md">
	{#if modalState.record && tableMetadata}
		<h3 class="mb-4 text-lg font-bold text-gray-900">Confirmer la suppression</h3>

		<div class="mb-4 rounded-md bg-red-50 p-4">
			<p class="font-medium text-red-600">
				{generateRecordSummary(modalState.record, tableMetadata)}
			</p>
		</div>

		<p class="mb-4 text-sm text-gray-600">
			Cette action est irréversible. Pour confirmer, veuillez taper
			<span class="font-mono font-bold">SUPPRIMER</span> ci-dessous.
		</p>

		<form
			method="POST"
			action="?/delete"
			use:enhance={() => {
				return async ({ result, update }) => {
					if (result.type === 'success') {
						toast.success('Enregistrement supprimé avec succès');
						closeModal();
						await loadTableData();
					} else if (result.type === 'failure') {
						toast.error(String(result.data?.error) || 'Une erreur est survenue');
					}
					await update();
				};
			}}
		>
			{#if selectedTable}
				<input type="hidden" name="database" value={selectedTable.database} />
				<input type="hidden" name="tableName" value={selectedTable.tableName} />
				<input
					type="hidden"
					name="primaryKeyValue"
					value={String(modalState.record[tableMetadata.primaryKey])}
				/>
			{/if}

			<div class="mb-4 space-y-2">
				<Label for="confirmation">Confirmation</Label>
				<Input
					id="confirmation"
					name="confirmation"
					bind:value={deleteConfirmation}
					placeholder="Tapez SUPPRIMER"
					class="font-mono"
				/>
			</div>

			<div class="flex justify-end space-x-2 pt-4">
				<Button type="button" variant="noir" onclick={closeModal}>
					<CircleX class="mr-2 h-4 w-4" />
					Annuler
				</Button>
				<Button type="submit" variant="rouge" disabled={deleteConfirmation !== 'SUPPRIMER'}>
					<Trash2 class="mr-2 h-4 w-4" />
					Supprimer définitivement
				</Button>
			</div>
		</form>
	{/if}
</Modal>

<style>
	/* Surcharge de la sidebar Shadcn pour qu'elle commence sous la navbar sticky */
	:global([data-slot='sidebar-container']) {
		top: 138px !important;
		height: calc(100vh - 138px) !important;
	}

	/* Hover bleu sur les lignes du tableau */
	.group:hover :global(td) {
		background-color: #bfdbfe !important;
	}
</style>
