<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { Modal } from 'flowbite-svelte';
	import ExplorerSidebar from './services/ExplorerSidebar.svelte';
	import * as Table from '$lib/components/ui/table';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import { Loader2, Plus, Pencil, Trash2, Database } from 'lucide-svelte';
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

	// ===== DERIVED STATES =====
	let isReadOnly = $derived(tableMetadata?.category === 'view');
	let totalPages = $derived(Math.ceil(totalRows / pageSize));
	let displayedFields = $derived(
		tableMetadata?.fields.filter((f) => !f.isPrimaryKey) || []
	);

	// ===== EFFETS =====
	// Charger les données quand la table sélectionnée change
	$effect(() => {
		if (selectedTable) {
			loadTableData();
		}
	});

	// ===== HANDLERS =====
	async function loadTableData() {
		if (!selectedTable) return;

		isLoading = true;
		const formData = new FormData();
		formData.append('database', selectedTable.database);
		formData.append('tableName', selectedTable.tableName);
		formData.append('page', String(currentPage));

		try {
			const response = await fetch('?/loadTable', { method: 'POST', body: formData });
			const result = await response.json();

			if (result.type === 'success') {
				tableData = result.data || [];
				tableMetadata = result.metadata;
				totalRows = result.total || 0;
			} else {
				toast.error('Erreur lors du chargement de la table');
			}
		} catch (error) {
			console.error('Erreur lors du chargement:', error);
			toast.error('Erreur lors du chargement de la table');
		} finally {
			isLoading = false;
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

	function openEditModal(record: Record<string, unknown>) {
		modalState = { mode: 'edit', record };
		isCreateEditModalOpen = true;
	}

	function openDeleteModal(record: Record<string, unknown>) {
		modalState = { mode: 'delete', record };
		deleteConfirmation = '';
		isDeleteModalOpen = true;
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
			loadTableData();
		}
	}

	// Formater la valeur pour affichage (données brutes)
	function formatValue(value: unknown): string {
		if (value === null || value === undefined) {
			return '';
		}
		if (value instanceof Date) {
			return value.toISOString();
		}
		return String(value);
	}
</script>

<div class="flex h-screen">
	<!-- Sidebar -->
	<div class="w-64 border-r bg-card">
		<ExplorerSidebar allTables={data.allTables} on:tableSelect={handleTableSelect} />
	</div>

	<!-- Zone d'affichage principale -->
	<div class="flex-1 overflow-auto p-6">
		{#if !selectedTable}
			<!-- Message de sélection -->
			<div class="flex h-full items-center justify-center">
				<Card.Root class="max-w-md">
					<Card.Header>
						<Card.Title class="flex items-center gap-2">
							<Database class="size-5" />
							Database Explorer
						</Card.Title>
						<Card.Description>
							Sélectionnez une table ou une vue dans la barre latérale pour visualiser ses
							données
						</Card.Description>
					</Card.Header>
				</Card.Root>
			</div>
		{:else}
			<!-- En-tête de la table -->
			<div class="mb-4 flex items-center justify-between">
				<div>
					<h1 class="text-2xl font-bold">
						{selectedTable.tableName}
					</h1>
					<p class="text-sm text-muted-foreground">
						{selectedTable.database} • {selectedTable.schema}
						{#if isReadOnly}
							<Badge variant="vert" class="ml-2">Lecture seule</Badge>
						{/if}
					</p>
				</div>

				{#if !isReadOnly}
					<Button variant="bleu" onclick={openCreateModal}>
						<Plus class="size-4" />
						Ajouter
					</Button>
				{/if}
			</div>

			<!-- Table de données -->
			{#if isLoading}
				<div class="flex items-center justify-center py-12">
					<Loader2 class="size-8 animate-spin text-primary" />
				</div>
			{:else if tableData.length === 0}
				<Card.Root>
					<Card.Content class="py-12 text-center text-muted-foreground">
						Aucune donnée disponible
					</Card.Content>
				</Card.Root>
			{:else}
				<Card.Root>
					<Card.Content class="p-0">
						<div class="overflow-x-auto">
							<Table.Root>
								<Table.Header>
									<Table.Row>
										{#if tableMetadata}
											{#each tableMetadata.fields as field (field.name)}
												<Table.Head>{field.name}</Table.Head>
											{/each}
											{#if !isReadOnly}
												<Table.Head class="text-right">Actions</Table.Head>
											{/if}
										{/if}
									</Table.Row>
								</Table.Header>
								<Table.Body>
									{#each tableData as record, i (i)}
										<Table.Row>
											{#if tableMetadata}
												{#each tableMetadata.fields as field (field.name)}
													<Table.Cell>
														{formatValue(record[field.name])}
													</Table.Cell>
												{/each}
												{#if !isReadOnly}
													<Table.Cell class="text-right">
														<div class="flex justify-end gap-2">
															<Button
																variant="blanc"
																size="sm"
																onclick={() => openEditModal(record)}
															>
																<Pencil class="size-3.5" />
															</Button>
															<Button
																variant="rouge"
																size="sm"
																onclick={() => openDeleteModal(record)}
															>
																<Trash2 class="size-3.5" />
															</Button>
														</div>
													</Table.Cell>
												{/if}
											{/if}
										</Table.Row>
									{/each}
								</Table.Body>
							</Table.Root>
						</div>
					</Card.Content>
				</Card.Root>

				<!-- Pagination -->
				{#if totalPages > 1}
					<div class="mt-4 flex items-center justify-between">
						<p class="text-sm text-muted-foreground">
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
</div>

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

			<div class="space-y-4">
				{#each displayedFields as field (field.name)}
					<div class="space-y-2">
						<Label for={field.name}>
							{field.name}
							{#if field.isRequired}
								<span class="text-destructive">*</span>
							{/if}
						</Label>
						<Input
							id={field.name}
							name={field.name}
							type={field.type === 'DateTime' ? 'datetime-local' : 'text'}
							required={field.isRequired}
							value={modalState.record
								? formatValue(modalState.record[field.name])
								: ''}
						/>
						<p class="text-xs text-muted-foreground">
							Type: {field.type}
							{field.isRequired ? ' (requis)' : ' (optionnel)'}
						</p>
					</div>
				{/each}
			</div>

			<div class="flex justify-end space-x-2 pt-4">
				<Button type="button" variant="blanc" onclick={closeModal}>
					Annuler
				</Button>
				<Button type="submit" variant="bleu">
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
			Cette action est irréversible. Pour confirmer, veuillez taper{' '}
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
				<Button type="button" variant="blanc" onclick={closeModal}>
					Annuler
				</Button>
				<Button type="submit" variant="rouge" disabled={deleteConfirmation !== 'SUPPRIMER'}>
					Supprimer définitivement
				</Button>
			</div>
		</form>
	{/if}
</Modal>