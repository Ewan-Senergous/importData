<!-- src/routes/export/+page.svelte -->
<script lang="ts">
	import { fade } from 'svelte/transition';
	import { untrack } from 'svelte';
	import { superForm } from 'sveltekit-superforms/client';
	import { Spinner } from '$lib/components/ui/spinner';
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { toast } from 'svelte-sonner';
	import {
		Database,
		FileSpreadsheet,
		FileText,
		Eye,
		CheckCircle,
		ChartColumn,
		RefreshCcw,
		CircleArrowRight,
		FileType,
		Sheet,
		Table as TableIcon,
		Search
	} from 'lucide-svelte';
	import type { ExportTableInfo, ExportResult } from './+page.server.js';
	import type { DatabaseName } from '$lib/prisma-meta.js';
	import ExportPreviewResult from './ExportPreviewResult.svelte';
	import {
		SCHEMA_CONFIG,
		getSchemaIcon,
		getTableIcon,
		getBadgeVariant,
		getDatabaseBadgeInfo
	} from '$lib/components/ui-database-config';

	interface FileData {
		content: string;
		mimeType: string;
		fileName: string;
	}

	interface ExportFormData {
		selectedSources: string[];
		format: 'xlsx' | 'csv' | 'xml' | 'json';
		includeHeaders: boolean;
		rowLimit?: number;
		filters: Record<string, unknown>;
	}

	// Fonctions utilitaires locales
	function formatNumber(num: number): string {
		return new Intl.NumberFormat('fr-FR').format(num);
	}

	function formatFileSize(bytes: number): string {
		const units = ['B', 'KB', 'MB', 'GB'];
		let size = bytes;
		let unitIndex = 0;
		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024;
			unitIndex++;
		}
		return `${size.toFixed(1)} ${units[unitIndex]}`;
	}

	function formatPreviewValue(value: unknown): string {
		if (value === null || value === undefined) return '';

		const str = String(value);

		// Si c'est de l'hex (détection pour données binaires converties côté serveur)
		if (/^[0-9A-F]+$/i.test(str) && str.length > 10) {
			return '0x' + str.toUpperCase();
		}

		// Autres données - troncature à 50 caractères max
		return str.length > 50 ? str.substring(0, 47) + '...' : str;
	}

	// Props avec $props() - Mode Runes Svelte 5
	let { data } = $props();

	// Vérifier les tables dans un effet réactif
	$effect(() => {
		if (!data?.tables?.length) {
			console.warn('⚠️ [CLIENT] Aucune table trouvée');
		}
	});

	// Initialisation du formulaire SuperForm avec untrack() pour capturer la valeur initiale
	// untrack() indique explicitement à Svelte qu'on ne veut PAS la réactivité sur data.form
	const {
		form,
		enhance: superEnhance,
		submitting,
		reset
	} = superForm(untrack(() => data.form), {
		dataType: 'json',
		onUpdated: ({ form }) => {
			if (form && form.data) {
				if ('result' in form.data) {
					const result = form.data.result as ExportResult;
					const formData = form.data as Record<string, unknown>;
					const fileData = formData.fileData as FileData | undefined;
					handleExportResult(result, fileData);
				}
				if ('preview' in form.data) {
					previewData = form.data.preview as Record<string, unknown[]>;
					const formData = form.data as Record<string, unknown>;
					previewConfig = formData.previewConfig as { includeHeaders: boolean } | null;
					step = 3;
				}
			}
		},
		onResult: ({ result }) => {
			if (result.type === 'success' && result.data) {
				if ('result' in result.data) {
					const exportResult = result.data.result as ExportResult;
					const resultData = result.data as Record<string, unknown>;
					const fileData = resultData.fileData as FileData | undefined;
					handleExportResult(exportResult, fileData);
				}
				if ('preview' in result.data) {
					previewData = result.data.preview as Record<string, unknown[]>;
					const resultData = result.data as Record<string, unknown>;
					previewConfig = resultData.previewConfig as { includeHeaders: boolean } | null;
					step = 3;
				}
			} else {
				console.warn('⚠️ [CLIENT] Result type non-success:', result.type);
			}
		},
		onError: (event) => {
			console.error('❌ [CLIENT] Erreur de soumission SuperForm:', event);
			Alert.alertActions.error("Une erreur est survenue lors de l'export");
		}
	});

	// État de l'interface (Svelte 5 $state)
	let step = $state(1);
	let searchTerm = $state('');
	let previewData = $state<Record<string, unknown[]>>({});
	let previewConfig = $state<{ includeHeaders: boolean } | null>(null);
	let exportResult = $state<ExportResult | null>(null);

	// États pour les filtres (Svelte 5 $state)
	let selectedType = $state<'all' | 'tables' | 'views'>('all');
	let selectedDatabase = $state<'all' | DatabaseName>('all');
	let selectedSchema = $state<'all' | string>('all');

	// Configuration d'export sauvegardée (Svelte 5 $state)
	let savedExportConfig = $state<ExportFormData | null>(null);

	// Valeur dérivée pour détecter quand sauvegarder la config
	let shouldSaveConfig = $derived(
		step === 3 && Object.keys(previewData).length > 0 && !savedExportConfig
	);

	// Effet pour sauvegarder la config quand nécessaire
	$effect(() => {
		if (shouldSaveConfig) {
			savedExportConfig = { ...$form } as ExportFormData;
			// Log informatif (pas pour la réactivité)
			console.log(
				'💾 [SYNC] Configuration sauvegardée avec',
				savedExportConfig?.selectedSources?.length || 0,
				'sources'
			);
		}
	});

	// Valeur dérivée pour détecter si synchronisation nécessaire
	let needsSync = $derived(() => {
		if (!(step === 3 && savedExportConfig)) return false;

		const currentSources = $form.selectedSources?.length || 0;
		const savedSources = savedExportConfig.selectedSources?.length || 0;

		return currentSources !== savedSources || $form.format !== savedExportConfig.format;
	});

	// Effet pour synchroniser quand nécessaire
	$effect(() => {
		if (needsSync() && savedExportConfig) {
			const currentSources = $form.selectedSources?.length || 0;
			const savedSources = savedExportConfig.selectedSources?.length || 0;

			console.log(`🔄 [SYNC] Synchronisation: ${currentSources} → ${savedSources} sources`);

			$form.selectedSources = savedExportConfig.selectedSources;
			$form.format = savedExportConfig.format;
			$form.includeHeaders = savedExportConfig.includeHeaders;
			$form.rowLimit = savedExportConfig.rowLimit;
			$form.filters = savedExportConfig.filters;
		}
	});

	// Récupération dynamique des bases de données depuis le serveur (Svelte 5 $derived)
	const databases = $derived(data.databases as DatabaseName[]);

	// Obtenir les schémas uniques (Svelte 5 $derived)
	let uniqueSchemas = $derived([
		...new Set((data?.tables || []).map((t: ExportTableInfo) => t.schema))
	]);

	// Formats d'export (Svelte 5 $derived)
	const exportFormats = $derived(
		data.exportFormats.map((format) => ({
			...format,
			icon: format.value === 'xlsx' ? FileSpreadsheet : FileText
		}))
	);

	// Gestion des résultats d'export
	function handleExportResult(result: ExportResult, fileData?: FileData) {
		exportResult = result;
		if (result.success) {
			if (fileData) {
				triggerDirectDownload(fileData);
			} else {
				console.warn('⚠️ [CLIENT] Aucune donnée de fichier reçue');
			}
			Alert.alertActions.success(result.message);
			step = 4;
		} else {
			console.error("❌ [CLIENT] Échec de l'export:", result.message);
			Alert.alertActions.error(result.message);
		}
	}

	// Téléchargement direct depuis base64
	function triggerDirectDownload(fileData: FileData) {
		try {
			if (!fileData.content) {
				throw new Error('Aucun contenu de fichier fourni');
			}

			const binaryString = atob(fileData.content);
			const bytes = new Uint8Array(binaryString.length);
			for (let i = 0; i < binaryString.length; i++) {
				bytes[i] = binaryString.charCodeAt(i);
			}

			const blob = new Blob([bytes], { type: fileData.mimeType });
			const url = window.URL.createObjectURL(blob);

			const link = document.createElement('a');
			link.href = url;
			link.download = fileData.fileName;
			document.body.appendChild(link);

			link.click();

			// Nettoyage
			document.body.removeChild(link);
			window.URL.revokeObjectURL(url);

			// Téléchargement terminé avec succès
		} catch (err) {
			console.error('❌ [CLIENT] Erreur téléchargement:', err);
			Alert.alertActions.error('Erreur lors du téléchargement du fichier');
		}
	}

	// Tables filtrées (Svelte 5 $derived)
	let filteredTables = $derived(
		(data?.tables || []).filter((table: ExportTableInfo) => {
			const matchesType =
				selectedType === 'all' ||
				(selectedType === 'tables' && table.category === 'table') ||
				(selectedType === 'views' && table.category === 'view');
			const matchesDB = selectedDatabase === 'all' || table.database === selectedDatabase;
			const matchesSchema = selectedSchema === 'all' || table.schema === selectedSchema;
			const matchesSearch =
				searchTerm === '' ||
				table.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
				table.displayName.toLowerCase().includes(searchTerm.toLowerCase());
			return matchesType && matchesDB && matchesSchema && matchesSearch;
		})
	);

	// Compter sources filtrées sélectionnées (Svelte 5 $derived)
	let selectedFilteredCount = $derived(
		filteredTables.filter((table: ExportTableInfo) =>
			$form.selectedSources.includes(`${table.database}-${table.name}`)
		).length
	);

	// Réinitialiser l'export
	function resetExport() {
		step = 1;
		previewData = {};
		previewConfig = null;
		exportResult = null;
		savedExportConfig = null;
		reset();
	}

	// Navigation entre étapes
	function goToStep(newStep: number) {
		step = newStep;
	}

	// Validation avant étape suivante
	function validateAndNext() {
		if (!$form.format) {
			toast.error('Format non sélectionné', {
				description: "Veuillez sélectionner un format d'export."
			});
			return;
		}
		step = 2;
	}
</script>

<div class="container mx-auto my-8 max-w-4xl px-2 lg:max-w-7xl">
	<div class="mb-6">
		<h1 class="text-2xl font-bold">Export de données :</h1>
		<p class="text-gray-600">
			Exportez vos données dans différents formats avec des options avancées
		</p>
	</div>

	<Alert.GlobalAlert />

	<!-- Indicateur d'étapes -->
	<Card.Root variant="blanc" class="mb-8 w-full max-w-none">
		<Card.Content>
			<div class="steps flex justify-between">
				<div class={`step-item ${step >= 1 ? 'text-blue-700' : ''} flex-1`}>
					<div class="flex items-center">
						<div
							class={`mr-1 flex h-8 w-8 items-center justify-center rounded-full sm:mr-2 ${step >= 1 ? 'bg-blue-100 text-blue-700' : 'bg-gray-200'}`}
						>
							1
						</div>
						<span class="hidden sm:inline">Sélection des sources</span>
						<span class="sm:hidden">Sources</span>
					</div>
				</div>
				<div class="step-separator mx-4 h-px flex-1 self-center bg-gray-300"></div>
				<div class={`step-item ${step >= 2 ? 'text-blue-700' : ''} flex-1`}>
					<div class="flex items-center">
						<div
							class={`mr-1 flex h-8 w-8 items-center justify-center rounded-full sm:mr-2 ${step >= 2 ? 'bg-blue-100 text-blue-700' : 'bg-gray-200'}`}
						>
							2
						</div>
						<span class="hidden sm:inline">Configuration</span>
						<span class="sm:hidden">Config</span>
					</div>
				</div>
				<div class="step-separator mx-4 h-px flex-1 self-center bg-gray-300"></div>
				<div class={`step-item ${step >= 3 ? 'text-blue-700' : ''} flex-1`}>
					<div class="flex items-center">
						<div
							class={`mr-1 flex h-8 w-8 items-center justify-center rounded-full sm:mr-2 ${step >= 3 ? 'bg-blue-100 text-blue-700' : 'bg-gray-200'}`}
						>
							3
						</div>
						<span class="hidden sm:inline">Aperçu & Export</span>
						<span class="sm:hidden">Export</span>
					</div>
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	<!-- Résumé des données -->
	<Card.Root variant="blanc" class="mb-6 w-full max-w-none">
		<Card.Content>
			<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
				<div class="rounded-lg border border-blue-500 bg-blue-100 p-4">
					<div class="flex items-center justify-between">
						<div>
							<div class="text-2xl font-bold text-blue-700">{data.totalTables}</div>
							<div class="text-sm text-blue-900">Sources disponibles</div>
						</div>
						<Database class="h-8 w-8 text-blue-600" />
					</div>
				</div>
				<div class="rounded-lg border border-green-500 bg-green-100 p-4">
					<div class="flex items-center justify-between">
						<div>
							<div class="text-2xl font-bold text-green-700">{data.formattedTotalRows}</div>
							<div class="text-sm text-green-900">Lignes totales</div>
						</div>
						<ChartColumn class="h-8 w-8 text-green-600" />
					</div>
				</div>
				<div class="rounded-lg border border-fuchsia-500 bg-fuchsia-100 p-4">
					<div class="flex items-center justify-between">
						<div>
							<div class="text-2xl font-bold text-fuchsia-700">{filteredTables.length}</div>
							<div class="text-sm text-fuchsia-900">Sources filtrées</div>
						</div>
						<CheckCircle class="h-8 w-8 text-fuchsia-600" />
					</div>
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root variant="blanc" class="w-full max-w-none">
		<Card.Content>
			{#if step === 1}
				<!-- Étape 1: Sélection des tables -->
				<div class="mb-6">
					<h2 class="mb-4 text-xl font-bold text-black">Sélection des sources à exporter :</h2>

					<!-- Filtres avec Cards -->
					<div class="mb-6 space-y-4">
						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
							<!-- Card Type -->
							<Card.Root class="h-52 border-blue-500 bg-blue-100 shadow-md">
								<Card.Header>
									<Card.Title class="flex items-center gap-2 text-xl font-bold text-blue-700">
										<FileType class="h-6 w-6 text-blue-600" />
										Type de données :
									</Card.Title>
								</Card.Header>
								<Card.Content>
									<div class="space-y-2">
										<label class="flex cursor-pointer items-center space-x-2">
											<input
												type="radio"
												name="type"
												value="all"
												bind:group={selectedType}
												class="h-5 w-5 border-gray-300 text-blue-600 focus:ring-blue-500"
											/>
											<span class="text-base font-medium text-gray-900"
												><FileType class="mr-1 inline h-5 w-5" />Tous ({filteredTables.length})</span
											>
										</label>
										<label class="flex cursor-pointer items-center space-x-2">
											<input
												type="radio"
												name="type"
												value="tables"
												bind:group={selectedType}
												class="h-5 w-5 border-gray-300 text-blue-600 focus:ring-blue-500"
											/>
											<span class="text-base font-medium text-gray-900"
												><TableIcon class="mr-1 inline h-5 w-5" />Tables ({filteredTables.filter(
													(t) => t.category === 'table'
												).length})</span
											>
										</label>
										<label class="flex cursor-pointer items-center space-x-2">
											<input
												type="radio"
												name="type"
												value="views"
												bind:group={selectedType}
												class="h-5 w-5 border-gray-300 text-blue-600 focus:ring-blue-500"
											/>
											<span class="text-base font-medium text-gray-900"
												><Eye class="mr-1 inline h-5 w-5" />Vues ({filteredTables.filter(
													(t) => t.category === 'view'
												).length})</span
											>
										</label>
									</div>
								</Card.Content>
							</Card.Root>

							<!-- Card Base de données -->
							<Card.Root class="h-52 border-green-500 bg-green-100 shadow-md">
								<Card.Header>
									<Card.Title class="flex items-center gap-2 text-xl font-bold text-green-700">
										<Database class="h-6 w-6 text-green-600" />
										Base de données :
									</Card.Title>
								</Card.Header>
								<Card.Content>
									<div class="space-y-2">
										<label class="flex cursor-pointer items-center space-x-2">
											<input
												type="radio"
												name="database"
												value="all"
												bind:group={selectedDatabase}
												class="h-5 w-5 border-gray-300 text-blue-600 focus:ring-blue-500"
											/>
											<span class="text-base font-medium text-gray-900"
												><Database class="mr-1 inline h-5 w-5" />Toutes ({filteredTables.length})</span
											>
										</label>
										{#each databases as database (database)}
											{@const dbInfo = getDatabaseBadgeInfo(database)}
											{@const DbIcon = dbInfo.icon}
											<label class="flex cursor-pointer items-center space-x-2">
												<input
													type="radio"
													name="database"
													value={database}
													bind:group={selectedDatabase}
													class="h-5 w-5 border-gray-300 text-blue-600 focus:ring-blue-500"
												/>
												<span class="text-base font-medium text-gray-900">
													<DbIcon class="mr-0.5 inline h-5 w-5" />
													{dbInfo.label.split(' ')[1]} ({filteredTables.filter(
														(t) => t.database === database
													).length})</span
												>
											</label>
										{/each}
									</div>
								</Card.Content>
							</Card.Root>

							<!-- Card Schéma -->
							<Card.Root class="h-52 border-fuchsia-500 bg-fuchsia-100 shadow-md">
								<Card.Header>
									<Card.Title class="flex items-center gap-2 text-xl font-bold text-fuchsia-700">
										<Sheet class="h-6 w-6 text-fuchsia-600" />
										Schéma :
									</Card.Title>
								</Card.Header>
								<Card.Content>
									<div class="space-y-2">
										<label class="flex cursor-pointer items-center space-x-2">
											<input
												type="radio"
												name="schema"
												value="all"
												bind:group={selectedSchema}
												class="h-5 w-5 border-gray-300 text-blue-600 focus:ring-blue-500"
											/>
											<span class="text-base font-medium text-gray-900"
												><Sheet class="mr-1 inline h-5 w-5" />Tous ({filteredTables.length})</span
											>
										</label>
										{#each uniqueSchemas as schema (schema)}
											{@const SchemaIcon = getSchemaIcon(schema)}
											<label class="flex cursor-pointer items-center space-x-2">
												<input
													type="radio"
													name="schema"
													value={schema}
													bind:group={selectedSchema}
													class="h-5 w-5 border-gray-300 text-blue-600 focus:ring-blue-500"
												/>
												<span class="text-base font-medium text-gray-900">
													<SchemaIcon class="mr-0.5 inline h-5 w-5" />
													{SCHEMA_CONFIG[schema as keyof typeof SCHEMA_CONFIG]?.label || schema} ({filteredTables.filter(
														(t) => t.schema === schema
													).length})
												</span>
											</label>
										{/each}
									</div>
								</Card.Content>
							</Card.Root>
						</div>

						<!-- Recherche et actions -->
						<div class="grid grid-cols-1 items-center gap-6 sm:grid-cols-2 lg:grid-cols-3">
							<div class="flex items-center justify-center gap-4">
								<label class="flex min-h-[42px] cursor-pointer items-center space-x-2">
									<input
										type="checkbox"
										checked={filteredTables.length > 0 &&
											filteredTables.every((table: ExportTableInfo) =>
												$form.selectedSources.includes(`${table.database}-${table.name}`)
											)}
										onchange={() => {
											const filteredTableIds = filteredTables.map(
												(t: ExportTableInfo) => `${t.database}-${t.name}`
											);
											const selectedFilteredCount = filteredTableIds.filter((id) =>
												$form.selectedSources.includes(id)
											).length;

											if (selectedFilteredCount === filteredTables.length) {
												$form.selectedSources = $form.selectedSources.filter(
													(id) => !filteredTableIds.includes(id)
												);
											} else {
												const newSelection = [
													...new Set([...$form.selectedSources, ...filteredTableIds])
												];
												$form.selectedSources = newSelection;
											}
										}}
										class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
									/>
									<span class="text-sm">Sélectionner tout ({filteredTables.length})</span>
								</label>

								<Button
									variant="noir"
									onclick={() => {
										selectedType = 'all';
										selectedDatabase = 'all';
										selectedSchema = 'all';
										searchTerm = '';
									}}
								>
									<RefreshCcw class="mr-2 h-4 w-4" />
									Réinitialiser
								</Button>
							</div>

							<div class="relative">
								<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
								<Input
									type="text"
									bind:value={searchTerm}
									placeholder="Rechercher..."
									class="min-h-[42px] pl-9"
								/>
							</div>

							<div
								class="flex min-h-[42px] items-center justify-center rounded-lg border border-fuchsia-500 bg-fuchsia-100 px-6 py-3"
							>
								<div class="flex items-center gap-1 text-sm text-fuchsia-900">
									<CheckCircle class="h-4 w-4" />
									<span class="font-semibold">{selectedFilteredCount}</span> sélectionnées
								</div>
							</div>
						</div>
					</div>

					<!-- Liste des tables (simplifié pour ~450 lignes total) -->
					<div class="mb-6 max-h-96 overflow-y-auto">
						<div class="grid gap-3">
							{#each filteredTables as table (`${table.database}-${table.name}`)}
								{@const dbInfo = getDatabaseBadgeInfo(table.database)}
								{@const DbIconComponent = dbInfo.icon}
								{@const schemaVariant =
									SCHEMA_CONFIG[table.schema as keyof typeof SCHEMA_CONFIG]?.variant || 'cyan'}
								{@const schemaLabel =
									SCHEMA_CONFIG[table.schema as keyof typeof SCHEMA_CONFIG]?.label || table.schema}
								{@const TableIconComponent = getTableIcon(table.category)}
								{@const SchemaIconComponent = getSchemaIcon(table.schema)}
								<label
									class="flex max-w-xs cursor-pointer items-center space-x-3 rounded-lg border p-4 transition-colors hover:bg-red-100 sm:max-w-none"
								>
									<input
										type="checkbox"
										bind:group={$form.selectedSources}
										value={`${table.database}-${table.name}`}
										onchange={() => {
											const tableId = `${table.database}-${table.name}`;
											const isSelected = $form.selectedSources.includes(tableId);
											const tableType = table.category === 'view' ? 'vue' : 'table';

											if (isSelected) {
												toast.info(
													`${tableType.charAt(0).toUpperCase() + tableType.slice(1)} sélectionnée`,
													{
														description: `${table.displayName} (${table.formattedRowCount || formatNumber(table.rowCount || 0)} lignes)`
													}
												);
											} else {
												toast.info(
													`${tableType.charAt(0).toUpperCase() + tableType.slice(1)} désélectionnée`,
													{
														description: table.displayName
													}
												);
											}
										}}
										class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
									/>

									<div class="flex-1">
										<div class="flex items-center gap-3">
											<TableIconComponent class="h-5 w-5 text-gray-500" />
											<div class="min-w-0 flex-1">
												<div class="hidden sm:block">
													<div class="flex items-center gap-2">
														<span class="font-medium">{table.displayName}</span>
														<Badge variant={getBadgeVariant(table.category)}>
															{#if table.category === 'view'}
																<Eye />
															{:else}
																<TableIcon />
															{/if}
															{table.category}
														</Badge>
														<Badge variant={dbInfo.variant}>
															<DbIconComponent />
															{table.database.toUpperCase()}
														</Badge>
														<Badge variant={schemaVariant}>
															<SchemaIconComponent />
															{schemaLabel}
														</Badge>
													</div>
													<div class="text-sm text-gray-500">
														{table.displayName} • {table.formattedRowCount ||
															formatNumber(table.rowCount || 0)} lignes
													</div>
												</div>

												<div class="sm:hidden">
													<div class="font-medium">{table.displayName}</div>
													<div class="mt-1 text-sm text-gray-500">
														{table.formattedRowCount || formatNumber(table.rowCount || 0)} lignes
													</div>
													<div class="mt-2 flex flex-wrap gap-1">
														<Badge variant={getBadgeVariant(table.category)}>
															{#if table.category === 'view'}
																<Eye />Vue
															{:else}
																<TableIcon />Table
															{/if}
														</Badge>
														<Badge variant={dbInfo.variant}>
															<DbIconComponent />{table.database.toUpperCase()}
														</Badge>
														<Badge variant={schemaVariant}>
															<SchemaIconComponent />
															{schemaLabel}
														</Badge>
													</div>
												</div>
											</div>
										</div>
									</div>

									<div class="hidden text-right text-sm text-gray-500 sm:block">
										<div>{table.columns.length} colonnes</div>
										{#if table.relations && table.relations.length > 0}
											<div class="text-xs">{table.relations.length} relation(s)</div>
										{/if}
									</div>
								</label>
							{/each}
						</div>
					</div>

					<!-- Format d'export -->
					<div class="mb-6">
						<h3 class="mb-3 font-medium text-gray-900">Format d'export :</h3>
						<div class="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
							{#each exportFormats as format (format.value)}
								{@const FormatIconComponent = format.icon}
								<label
									class="flex cursor-pointer items-center space-x-3 rounded-lg border p-4 transition-colors hover:bg-gray-50 {$form.format ===
									format.value
										? 'border-blue-500 bg-blue-50'
										: ''}"
								>
									<input
										type="radio"
										bind:group={$form.format}
										value={format.value}
										class="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
									/>
									<div class="flex-1">
										<div class="flex items-center gap-2">
											<FormatIconComponent class="h-5 w-5 text-gray-900" />
											<span class="font-medium whitespace-nowrap text-gray-900">{format.label}</span
											>
											{#if format.recommended}
												<Badge variant="noir">Recommandé</Badge>
											{/if}
										</div>
										<div class="text-sm text-gray-900">{format.description}</div>
									</div>
								</label>
							{/each}
						</div>
					</div>

					<div class="flex justify-center gap-4">
						<Button
							variant="bleu"
							onclick={validateAndNext}
							disabled={$form.selectedSources.length === 0 || !$form.format}
						>
							Continuer
							<CircleArrowRight class="ml-2 h-4 w-4" />
						</Button>
					</div>
				</div>
			{/if}

			<!-- Étapes 2, 3 et 4: Configuration, Aperçu et Résultat -->
			<ExportPreviewResult
				{step}
				{previewData}
				{previewConfig}
				{exportResult}
				formStore={form}
				{superEnhance}
				{exportFormats}
				tables={data.tables}
				{goToStep}
				{resetExport}
				{formatPreviewValue}
				{formatNumber}
				{formatFileSize}
				submitting={$submitting}
			/>
		</Card.Content>
	</Card.Root>

	{#if $submitting}
		<div
			transition:fade
			class="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black"
		>
			<div class="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
				<Spinner class="mx-auto mb-4 size-12 text-blue-600" />
				<p class="text-center font-medium">
					{step === 3 ? "Génération de l'export en cours..." : 'Traitement en cours...'}
				</p>
			</div>
		</div>
	{/if}
</div>
