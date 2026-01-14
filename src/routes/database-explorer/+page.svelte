<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Modal } from 'flowbite-svelte';
	import ExplorerSidebar from './services/ExplorerSidebar.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import { Textarea } from '$lib/components/ui/textarea';
	import {
		Loader2,
		CirclePlus,
		CircleCheck,
		CircleX,
		Trash2,
		Database,
		CheckSquare,
		Square,
		SquareChevronLeft,
		SquareChevronRight,
		CircleArrowUp,
		CircleArrowDown,
		Eye
	} from 'lucide-svelte';
	import type { PageData } from './$types';
	import type { TableSelection } from './services/explorer.service';
	import type { TableMetadata } from './repositories/explorer.repository';
	import { generateRecordSummary } from './services/explorer.service';
	import { useSidebar } from '$lib/components/ui/sidebar/context.svelte.js';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	// Récupérer l'instance sidebar pour accéder à son état
	const sidebar = useSidebar();

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

	// États pour l'édition inline
	let editingCell = $state<{
		rowIndex: number;
		fieldName: string;
		originalValue: unknown;
		newValue: string;
		record: Record<string, unknown>;
	} | null>(null);
	let isSaving = $state(false);
	let editInputElement = $state<HTMLTextAreaElement | null>(null);

	// États pour la sélection multiple
	let selectedItems = $state<Record<string, unknown>[]>([]);
	let selectAll = $state(false);

	// AbortController pour annuler les requêtes en cours
	let abortController: AbortController | null = null;

	// État pour détecter le scroll
	let isScrolled = $state(false);

	// État pour le tri des colonnes
	let sortConfig = $state<{ field: string; order: 'asc' | 'desc' }>({
		field: '',
		order: 'asc'
	});

	// ===== DERIVED STATES =====
	let isReadOnly = $derived(tableMetadata?.category === 'view');
	let totalPages = $derived(Math.ceil(totalRows / pageSize));
	// Afficher TOUS les champs dans le modal (comme dans le tableau)
	// Mais on désactivera l'édition pour les champs auto-générés
	let displayedFields = $derived(tableMetadata?.fields || []);
	let selectedCount = $derived(selectedItems.length);
	let hasSelection = $derived(selectedCount > 0);

	// ===== EFFETS =====
	// Restaurer la sélection depuis les query params (gère aussi les boutons précédent/suivant)
	$effect(() => {
		const searchParams = $page.url.searchParams;
		const database = searchParams.get('database');
		const schema = searchParams.get('schema');
		const tableName = searchParams.get('table');
		const pageParam = searchParams.get('page');
		const sortField = searchParams.get('sortField');
		const sortOrder = searchParams.get('sortOrder') as 'asc' | 'desc' | null;

		// Si on a tous les paramètres nécessaires
		if (database && schema && tableName) {
			// Vérifier si la sélection est différente de l'état actuel
			const isDifferentTable =
				!selectedTable ||
				selectedTable.database !== database ||
				selectedTable.schema !== schema ||
				selectedTable.tableName !== tableName;

			const isDifferentPage = currentPage !== Number.parseInt(pageParam || '1', 10);
			const isDifferentSort =
				sortConfig.field !== (sortField || '') || sortConfig.order !== (sortOrder || 'asc');

			// Restaurer seulement ce qui est différent (évite les boucles infinies)
			if (isDifferentTable) {
				selectedTable = { database, schema, tableName };
			}

			if (isDifferentPage) {
				currentPage = pageParam ? Number.parseInt(pageParam, 10) : 1;
			}

			if (isDifferentSort) {
				// Restaurer le tri ou utiliser la clé primaire par défaut
				if (sortField && sortOrder) {
					sortConfig = { field: sortField, order: sortOrder };
				} else {
					// Si pas de tri dans l'URL, reset
					sortConfig = { field: '', order: 'asc' };
				}
			}
		} else if (!database && !schema && !tableName && selectedTable) {
			// Si l'URL est vide mais qu'une table est sélectionnée, réinitialiser
			selectedTable = null;
			currentPage = 1;
			sortConfig = { field: '', order: 'asc' };
		}
	});

	// Charger les données quand la table sélectionnée OU la page OU le tri change
	$effect(() => {
		// Lire explicitement les dépendances pour la réactivité
		const table = selectedTable;
		const page = currentPage;
		const sort = sortConfig; // Ajouter le tri comme dépendance

		if (table) {
			// Réinitialiser la sélection quand on change de table ou de page
			selectedItems = [];
			selectAll = false;

			// Charger les données
			loadTableData();

			// Scroll vers le haut - attendre que le DOM soit mis à jour
			setTimeout(() => {
				const container = document.querySelector('.overflow-x-auto.overflow-y-auto');

				if (container) {
					container.scrollTop = 0;
					container.scrollLeft = 0;
				}
				// Aussi scroller window au cas où
				window.scrollTo(0, 0);
			}, 100);
		}
	});

	// Gérer le scroll du body selon si une table est sélectionnée
	$effect(() => {
		const html = document.documentElement;
		const body = document.body;

		if (!selectedTable) {
			// Pas de table sélectionnée : bloquer le scroll
			html.style.overflow = 'hidden';
			html.style.height = '100vh';
			body.style.overflow = 'hidden';
			body.style.height = '100vh';
		} else {
			// Table sélectionnée : permettre le scroll
			html.style.overflow = '';
			html.style.height = '';
			body.style.overflow = '';
			body.style.height = '';
		}

		// Cleanup
		return () => {
			html.style.overflow = '';
			html.style.height = '';
			body.style.overflow = '';
			body.style.height = '';
		};
	});

	// Focus l'input d'édition quand il apparaît
	$effect(() => {
		if (editingCell && editInputElement) {
			editInputElement.focus();
		}
	});

	// Détecter le scroll pour afficher le fond du header sticky
	$effect(() => {
		function handleScroll() {
			const scrollY = window.scrollY || document.documentElement.scrollTop;
			const newValue = scrollY > 0;

			if (isScrolled !== newValue) {
				isScrolled = newValue;
			}
		}

		window.addEventListener('scroll', handleScroll, { passive: true });

		return () => {
			window.removeEventListener('scroll', handleScroll);
		};
	});

	// ===== HANDLERS =====
	// Mettre à jour l'URL avec les query params
	function updateUrl() {
		if (!selectedTable) return;

		const params = new URLSearchParams();
		params.set('database', selectedTable.database);
		params.set('schema', selectedTable.schema);
		params.set('table', selectedTable.tableName);
		params.set('page', String(currentPage));

		// Ajouter les paramètres de tri si définis
		if (sortConfig.field) {
			params.set('sortField', sortConfig.field);
			params.set('sortOrder', sortConfig.order);
		}

		goto(`?${params.toString()}`, { replaceState: true, noScroll: true, keepFocus: true });
	}

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
					page: currentPage,
					...(sortConfig.field && {
						sortField: sortConfig.field,
						sortOrder: sortConfig.order
					})
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

				// Initialiser le tri avec la clé primaire si aucun tri n'est défini
				if (!sortConfig.field && tableMetadata) {
					sortConfig = { field: tableMetadata.primaryKey, order: 'asc' };
					// Mettre à jour l'URL pour refléter le tri par défaut
					updateUrl();
				}
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
		// Reset le tri seulement si nécessaire (évite de créer un nouvel objet inutilement)
		if (sortConfig.field !== '' || sortConfig.order !== 'asc') {
			sortConfig = { field: '', order: 'asc' };
		}
		// Mettre à jour l'URL immédiatement (synchrone) pour que l'effet URL ne réinitialise pas
		updateUrl();
	}

	function handleSort(fieldName: string) {
		if (sortConfig.field === fieldName) {
			// Même colonne → inverser l'ordre
			sortConfig = { field: fieldName, order: sortConfig.order === 'asc' ? 'desc' : 'asc' };
		} else {
			// Nouvelle colonne → ASC par défaut
			sortConfig = { field: fieldName, order: 'asc' };
		}

		currentPage = 1; // Reset à la page 1 lors du tri
		updateUrl(); // Mettre à jour l'URL
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
			// Mettre à jour l'URL immédiatement (synchrone)
			updateUrl();
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
			formData.append('schema', selectedTable!.schema);

			// Construire primaryKeyValues pour clés composées
			const primaryKeyValues = selectedItems.map((r) => {
				if (tableMetadata!.primaryKeys && tableMetadata!.primaryKeys.length > 1) {
					// Clé composée : créer un objet avec toutes les valeurs
					const pkValue: Record<string, unknown> = {};
					for (const key of tableMetadata!.primaryKeys) {
						pkValue[key] = r[key];
					}
					return pkValue;
				}
				// Clé simple : une seule valeur
				return r[tableMetadata!.primaryKey];
			});

			formData.append('primaryKeyValues', JSON.stringify(primaryKeyValues));

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

	// ===== HANDLERS ÉDITION INLINE =====
	function handleCellDoubleClick(
		rowIndex: number,
		fieldName: string,
		value: unknown,
		record: Record<string, unknown>
	) {
		// Vérifier si le champ est éditable
		const field = tableMetadata?.fields.find((f) => f.name === fieldName);
		if (field?.isPrimaryKey || field?.isUpdatedAt) {
			toast.error('Ce champ ne peut pas être modifié');
			return;
		}

		editingCell = {
			rowIndex,
			fieldName,
			originalValue: value,
			newValue: formatValue(value),
			record
		};
	}

	function handleInputKeydown(e: KeyboardEvent) {
		// Ctrl+Enter pour sauvegarder (Enter seul permet les retours à la ligne)
		if (e.key === 'Enter' && e.ctrlKey) {
			e.preventDefault();
			saveEdit();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			cancelEdit();
		}
	}

	function cancelEdit() {
		editingCell = null;
		isSaving = false;
	}

	async function saveEdit() {
		if (!editingCell || !selectedTable || !tableMetadata) return;

		// Si pas de changement, annuler
		if (editingCell.newValue === formatValue(editingCell.originalValue)) {
			cancelEdit();
			return;
		}

		// Construire primaryKeyValue pour clés composées
		let primaryKeyValue: unknown;
		if (tableMetadata.primaryKeys && tableMetadata.primaryKeys.length > 1) {
			// Clé composée : créer un objet avec toutes les valeurs
			primaryKeyValue = {};
			for (const key of tableMetadata.primaryKeys) {
				(primaryKeyValue as Record<string, unknown>)[key] = editingCell.record[key];
			}
		} else {
			// Clé simple : une seule valeur
			primaryKeyValue = editingCell.record[tableMetadata.primaryKey];
		}

		isSaving = true;

		try {
			const response = await fetch('/database-explorer/api/update-cell', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					database: selectedTable.database,
					schema: selectedTable.schema,
					tableName: selectedTable.tableName,
					primaryKeyValue,
					fieldName: editingCell.fieldName,
					newValue: editingCell.newValue
				})
			});

			const result = await response.json();

			if (result.success) {
				toast.success('Cellule mise à jour avec succès');
				// Mettre à jour la valeur localement
				tableData[editingCell.rowIndex][editingCell.fieldName] = editingCell.newValue;
				editingCell = null;
			} else {
				toast.error(result.error || 'Erreur lors de la mise à jour');
			}
		} catch (error) {
			console.error('❌ Erreur update inline:', error);
			toast.error('Erreur lors de la mise à jour');
		} finally {
			isSaving = false;
		}
	}
</script>

<Sidebar.Provider>
	<Sidebar.Sidebar>
		<ExplorerSidebar allTables={data.allTables} on:tableSelect={handleTableSelect} />
	</Sidebar.Sidebar>
	<Sidebar.SidebarInset>
		<div class="h-full overflow-y-auto">
			{#if !selectedTable}
				<!-- Message de sélection -->
				<div class="flex items-start justify-center p-6">
					<Card.Root class="w-full max-w-2xl shadow-lg">
						<Card.Header>
							<Card.Title class="flex items-center gap-2 text-xl">
								<Database class="size-6 shrink-0" />
								<span>Database Explorer</span>
							</Card.Title>
							<Card.Description class="text-base leading-relaxed">
								Sélectionnez une table ou une vue dans la barre latérale pour visualiser ses données
							</Card.Description>
						</Card.Header>
					</Card.Root>
				</div>
			{:else}
				<div>
					<!-- En-tête de la table -->
					<div
						class="fixed top-34.5 z-40 flex items-center bg-gray-50 py-3"
						style="left: var(--sidebar-width); right: 0;"
					>
						<!-- Bouton sidebar à gauche (sans padding) -->
						<div class="pr-1 pl-4">
							<Sidebar.Trigger>
								<Button variant="blanc" size="sm" class="gap-2">
									{#if sidebar.open}
										<SquareChevronLeft class="h-4 w-4" />
									{:else}
										<SquareChevronRight class="h-4 w-4" />
									{/if}
									<span class="hidden sm:inline">
										{sidebar.open ? 'Masquer' : 'Afficher'} la sidebar
									</span>
								</Button>
							</Sidebar.Trigger>
						</div>

						<!-- Zone centrale avec boutons d'action et texte (avec px-6 pour alignement tableau) -->
						<div class="flex flex-1 items-center justify-between px-6">
							<!-- Boutons d'action alignés avec début du tableau -->
							<div class="flex gap-2">
								{#if !isReadOnly}
									<Button variant="rouge" disabled={!hasSelection} onclick={handleDeleteSelected}>
										<Trash2 class="mr-2 h-4 w-4" />
										<span class="font-bold">Supprimer ({selectedCount})</span>
									</Button>
									<Button variant="vert" onclick={openCreateModal}>
										<CirclePlus class="mr-2 h-4 w-4" />
										<span class="font-bold">Ajouter</span>
									</Button>
								{/if}
							</div>

							<!-- Texte navigation à droite -->
							<p class="text-sm font-semibold text-gray-700">
								{selectedTable.database} ➡️ {selectedTable.schema} ➡️ {selectedTable.tableName}
								{#if isReadOnly}
									<Badge variant="vert" class="ml-2">
										<Eye />
										Lecture seule
									</Badge>
								{/if}
							</p>
						</div>
					</div>

					<!-- Espacement pour la barre fixe -->
					<div class="mb-16"></div>

					<!-- Conteneur avec scroll interne -->
					<div class="overflow-x-auto overflow-y-auto" style="height: calc(100vh - 310px);">
						<!-- Table de données -->
						{#if isLoading}
							<div class="flex items-center justify-center py-12">
								<Loader2 class="text-primary size-8 animate-spin" />
							</div>
						{:else if tableData.length === 0}
							<div class="relative">
								<table class="w-full min-w-max border-x border-black text-left text-sm">
									<thead class="sticky top-0 z-10 bg-blue-700 text-xs text-white uppercase">
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
														class="w-14 cursor-pointer border-x border-black px-4 py-3 whitespace-nowrap hover:bg-blue-800"
														onclick={() => handleSort(field.name)}
														title="Cliquer pour trier par {field.name}"
													>
														<div class="flex items-center justify-between gap-2">
															<span>{field.name}</span>
															{#if sortConfig.field === field.name}
																{#if sortConfig.order === 'asc'}
																	<CircleArrowUp class="h-3.5 w-3.5 shrink-0" />
																{:else}
																	<CircleArrowDown class="h-3.5 w-3.5 shrink-0" />
																{/if}
															{/if}
														</div>
													</th>
												{/each}
											{/if}
										</tr>
									</thead>
									<tbody>
										<tr>
											<td
												colspan={tableMetadata
													? tableMetadata.fields.length + (isReadOnly ? 0 : 1)
													: 1}
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
							<div class="relative">
								<table class="w-full min-w-max border-x border-black text-left text-sm">
									<thead class="sticky top-0 z-10 bg-blue-700 text-xs text-white uppercase">
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
														class="w-14 cursor-pointer border-x border-black px-4 py-3 whitespace-nowrap hover:bg-blue-800"
														onclick={() => handleSort(field.name)}
														title="Cliquer pour trier par {field.name}"
													>
														<div class="flex items-center justify-between gap-2">
															<span>{field.name}</span>
															{#if sortConfig.field === field.name}
																{#if sortConfig.order === 'asc'}
																	<CircleArrowUp class="h-3.5 w-3.5 shrink-0" />
																{:else}
																	<CircleArrowDown class="h-3.5 w-3.5 shrink-0" />
																{/if}
															{/if}
														</div>
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
														{@const isEditable =
															!isReadOnly && !field.isPrimaryKey && !field.isUpdatedAt}
														{@const isCurrentlyEditing =
															editingCell?.rowIndex === i && editingCell?.fieldName === field.name}
														<td
															class="w-14 border-x border-black px-4 py-3 {i % 2 === 0
																? 'bg-white'
																: 'bg-gray-100'} {isEditable ? 'cursor-text hover:bg-blue-50' : ''}"
															ondblclick={() =>
																isEditable &&
																handleCellDoubleClick(i, field.name, record[field.name], record)}
															title={isEditable ? 'Double-cliquez pour éditer' : ''}
														>
															{#if isCurrentlyEditing && editingCell}
																<div class="space-y-2">
																	<Textarea
																		bind:ref={editInputElement}
																		bind:value={editingCell.newValue}
																		onkeydown={(e) => handleInputKeydown(e)}
																		size="md"
																		class="border-2 border-blue-500 focus:border-blue-500"
																	/>
																	<div class="flex flex-col gap-1">
																		<button
																			type="button"
																			class="flex items-center gap-1 text-sm text-green-700 hover:text-green-900"
																			onclick={saveEdit}
																			disabled={isSaving}
																		>
																			<CircleCheck class="h-3 w-3" />
																			{#if isSaving}
																				<Loader2 class="h-3 w-3 animate-spin" />
																				Enregistrement...
																			{:else}
																				Save changes
																			{/if}
																		</button>
																		<button
																			type="button"
																			class="flex items-center gap-1 text-sm text-red-700 hover:text-red-900"
																			onclick={cancelEdit}
																			disabled={isSaving}
																		>
																			<CircleX class="h-3 w-3" />
																			Cancel changes
																		</button>
																	</div>
																</div>
															{:else}
																{formatValue(record[field.name])}
															{/if}
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
					</div>
					<!-- Fin conteneur scroll -->
				</div>
			{/if}
		</div>
	</Sidebar.SidebarInset>
</Sidebar.Provider>

<!-- Modal Create/Edit -->
<Modal bind:open={isCreateEditModalOpen} size="lg" class="top-16! mt-0!">
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
			<input type="hidden" name="schema" value={selectedTable.schema} />
			{#if modalState.mode === 'edit' && modalState.record}
				{@const primaryKeyValue =
					tableMetadata.primaryKeys.length > 1
						? JSON.stringify(
								Object.fromEntries(
									tableMetadata.primaryKeys.map((key) => [key, modalState.record![key]])
								)
							)
						: String(modalState.record[tableMetadata.primaryKey])}
				<input type="hidden" name="primaryKeyValue" value={primaryKeyValue} />
			{/if}

			<!-- Zone scrollable pour les champs -->
			<div class="max-h-[50vh] overflow-y-auto pr-2">
				<div class="grid grid-cols-2 gap-4">
					{#each displayedFields as field (field.name)}
						{@const isAutoGenerated =
							field.isPrimaryKey ||
							(field.hasDefaultValue && modalState.mode === 'create') ||
							field.isUpdatedAt}
						{@const isDisabled = isAutoGenerated}
						{@const isRequiredForUser =
							field.isRequired &&
							!field.hasDefaultValue &&
							!field.isPrimaryKey &&
							!field.isUpdatedAt}
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
			</div>

			<!-- Boutons toujours visibles en bas -->
			<div class="sticky bottom-0 mt-4 flex justify-end space-x-2 border-t bg-white pt-4">
				<Button type="button" variant="noir" onclick={closeModal}>
					<CircleX class="mr-2 h-4 w-4" />
					<span class="font-bold">Annuler</span>
				</Button>
				<Button type="submit" variant="vert">
					<CircleCheck class="mr-2 h-4 w-4" />
					<span class="font-bold">{modalState.mode === 'create' ? 'Créer' : 'Modifier'}</span>
				</Button>
			</div>
		{/if}
	</form>
</Modal>

<!-- Modal Delete -->
<Modal bind:open={isDeleteModalOpen} size="md" class="top-16! mt-0!">
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
			{#if selectedTable && tableMetadata}
				<input type="hidden" name="database" value={selectedTable.database} />
				<input type="hidden" name="tableName" value={selectedTable.tableName} />
				<input type="hidden" name="schema" value={selectedTable.schema} />
				{@const primaryKeyValue =
					tableMetadata.primaryKeys.length > 1
						? JSON.stringify(
								Object.fromEntries(
									tableMetadata.primaryKeys.map((key) => [key, modalState.record![key]])
								)
							)
						: String(modalState.record![tableMetadata.primaryKey])}
				<input type="hidden" name="primaryKeyValue" value={primaryKeyValue} />
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
					<span class="font-bold">Annuler</span>
				</Button>
				<Button type="submit" variant="rouge" disabled={deleteConfirmation !== 'SUPPRIMER'}>
					<Trash2 class="mr-2 h-4 w-4" />
					<span class="font-bold">Supprimer définitivement</span>
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

	/* Empêcher le débordement horizontal du SidebarInset */
	:global([data-slot='sidebar-inset']) {
		max-width: 100%;
		overflow-x: hidden;
	}

	/* Hover bleu sur les lignes du tableau */
	.group:hover :global(td) {
		background-color: #bfdbfe !important;
	}
</style>
