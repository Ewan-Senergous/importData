<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';
	import {
		Upload,
		AlertCircle,
		Check,
		CircleArrowLeft,
		CircleArrowRight,
		LoaderCircle,
		TriangleAlert
	} from 'lucide-svelte';

	interface ValidationResult {
		success: boolean;
		tableName: string;
		schemaName: string;
		upsertKey: string | null;
		activeColumns: string[];
		ignoredColumns: string[];
		validRows: number;
		totalRows: number;
		errors: { line: number; col: string; message: string }[];
		warnings: { col: string; message: string }[];
	}

	interface ImportResult {
		inserted: number;
		updated: number;
		errors: { line: number; error: string }[];
	}

	let {
		form = $bindable()
	}: {
		form?: {
			validation?: ValidationResult;
			result?: ImportResult;
			error?: string;
		} | null;
	} = $props();

	let step = $state(1);
	let csvFile = $state<File | null>(null);
	let csvContent = $state('');
	let fileName = $state('');
	let isProcessing = $state(false);
	let selectedDatabase = $state<'cenov' | 'cenov_dev' | 'cenov_preprod'>('cenov_dev');
	let detectedTableName = $state<string | null>(null);

	let parsedPreview = $state<{
		columns: { header: string; value: string }[];
		rowCount: number;
	} | null>(null);

	let validationReceived = $state(false);
	let resultReceived = $state(false);

	function handleFileUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;

		csvFile = input.files[0];
		fileName = csvFile.name;

		const reader = new FileReader();
		reader.onload = (event) => {
			csvContent = event.target?.result as string;
			parsePreview();
		};
		reader.readAsText(csvFile);
	}

	function parsePreview() {
		try {
			const content = csvContent.replace(/^\uFEFF/, '');
			const lines = content.split(/\r?\n/);

			if (lines.length < 2) {
				toast.error('Fichier CSV invalide (moins de 2 lignes)');
				return;
			}

			const firstLine = lines[0].trim();
			const tableMatch = /^#\s*Table:\s*(\w+)/i.exec(firstLine);

			if (!tableMatch) {
				toast.error('Ligne 1 doit commencer par "# Table: <nom>"');
				return;
			}

			detectedTableName = tableMatch[1];

			const headers = lines[1]
				.split(';')
				.map((h) => h.trim())
				.filter(Boolean);
			const values = lines[2] ? lines[2].split(';') : [];

			// Compter les lignes de données non vides
			let rowCount = 0;
			for (let i = 2; i < lines.length; i++) {
				const line = lines[i];
				if (line && line.trim() !== '' && !line.split(';').every((v) => !v || v.trim() === '')) {
					rowCount++;
				}
			}

			parsedPreview = {
				columns: headers.map((header, i) => ({
					header,
					value: values[i] ? values[i].trim() : ''
				})),
				rowCount
			};

			step = 2;
		} catch (error) {
			toast.error('Erreur parsing CSV: ' + (error instanceof Error ? error.message : 'Erreur'));
		}
	}

	function resetImport() {
		step = 1;
		csvFile = null;
		csvContent = '';
		fileName = '';
		parsedPreview = null;
		form = null;
		validationReceived = false;
		resultReceived = false;
		detectedTableName = null;
	}

	$effect(() => {
		if (form?.validation && validationReceived) {
			validationReceived = false;
			isProcessing = false;
			step = 3;
		}
	});

	$effect(() => {
		if (form?.result && resultReceived) {
			resultReceived = false;
			isProcessing = false;
			step = 4;
			toast.success('Import terminé !');
		}
	});

	$effect(() => {
		if (form?.error) {
			toast.error(form.error);
			isProcessing = false;
		}
	});

	const dbLabels: Record<string, string> = {
		cenov: 'cenov (Production)',
		cenov_dev: 'cenov_dev (Développement)',
		cenov_preprod: 'cenov_preprod (Pré-production)'
	};
</script>

<div class="container mx-auto max-w-4xl p-6">
	<h1 class="mb-6 text-3xl font-bold">Import CSV → Table BDD</h1>

	<Alert.GlobalAlert />

	<!-- Stepper -->
	<div class="mb-8 flex justify-between gap-2">
		{#each [{ n: 1, label: 'Upload' }, { n: 2, label: 'Preview' }, { n: 3, label: 'Validation' }, { n: 4, label: 'Import' }] as s (s.n)}
			<div class="flex-1">
				<div class="mb-2 text-center text-sm font-medium sm:text-base">
					<span class="sm:hidden">{s.n}</span>
					<span class="hidden sm:inline">{s.n}. {s.label}</span>
				</div>
				<div class="mx-1 h-2 rounded sm:mx-4 {step >= s.n ? 'bg-blue-500' : 'bg-gray-200'}"></div>
			</div>
		{/each}
	</div>

	<Card.Root variant="blanc" class="w-full max-w-none">
		<Card.Content>
			{#if step === 1}
				<!-- ÉTAPE 1 : Upload -->
				<div>
					<h2 class="mb-4 text-xl font-semibold text-black">1. Upload fichier CSV</h2>

					<!-- Sélection BDD -->
					<Card.Root variant="bleu" class="mb-4 py-4">
						<Card.Content class="px-4">
							<h3 class="mb-2 text-sm font-medium text-blue-700">Base de données cible :</h3>
							<div class="flex flex-col gap-2 sm:flex-row sm:gap-4">
								{#each ['cenov_dev', 'cenov_preprod', 'cenov'] as db (db)}
									<label class="flex cursor-pointer items-center">
										<input
											type="radio"
											name="database_select"
											value={db}
											bind:group={selectedDatabase}
											class="mr-2"
										/>
										<span class="text-sm">{dbLabels[db]}</span>
									</label>
								{/each}
							</div>
						</Card.Content>
					</Card.Root>

					<!-- Alert format CSV attendu -->
					<Alert.Root variant="warning" class="mb-4">
						<TriangleAlert />
						<Alert.Title>Format CSV attendu</Alert.Title>
						<Alert.Description>
							<p class="mb-2">
								La <strong>première ligne</strong> du fichier CSV doit contenir le nom de la table
								cible :
							</p>
							<code
								class="mb-2 block rounded bg-yellow-100 px-3 py-2 text-xs leading-relaxed text-yellow-900"
							>
								# Table: nom_de_la_table<br />
								colonne1;colonne2;colonne3<br />
								valeur1;valeur2;valeur3
							</code>
							<p class="text-xs">
								Séparateur : <strong>;</strong> (point-virgule). Les colonnes doivent correspondre
								aux noms des colonnes de la table en base de données.
							</p>
						</Alert.Description>
					</Alert.Root>

					<!-- Zone upload -->
					<div
						class="mb-4 cursor-pointer rounded-lg border-2 border-dashed border-gray-300 p-8 text-center transition-colors hover:border-blue-400 hover:bg-blue-50"
						role="button"
						tabindex="0"
						onclick={() => document.getElementById('fileInput')?.click()}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								document.getElementById('fileInput')?.click();
							}
						}}
					>
						<Upload class="mx-auto mb-2 h-12 w-12 text-gray-400" />
						<p class="mb-2 text-lg">Glissez-déposez votre fichier ici</p>
						<p class="mb-4 text-sm text-gray-500">ou</p>
						<input
							type="file"
							id="fileInput"
							class="hidden"
							accept=".csv"
							onchange={handleFileUpload}
						/>
						<Button
							variant="bleu"
							class="font-semibold"
							onclick={(e) => {
								e.stopPropagation();
								document.getElementById('fileInput')?.click();
							}}
						>
							<Upload class="mr-2 h-5 w-5" />
							Parcourir les fichiers
						</Button>
					</div>
				</div>
			{:else if step === 2 && parsedPreview}
				<!-- ÉTAPE 2 : Preview -->
				<div>
					<h2 class="mb-4 text-xl font-semibold text-black">
						<span class="block sm:inline">2. Preview :</span>
						<span class="mt-1 block truncate text-base sm:mt-0 sm:inline sm:text-xl"
							>{fileName}</span
						>
					</h2>

					<!-- Badge table détectée -->
					{#if detectedTableName}
						<div
							class="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3"
						>
							<span class="rounded bg-green-800 px-2 py-0.5 text-xs font-semibold text-white"
								>TABLE</span
							>
							<span class="text-sm text-green-800">
								Table : <strong>{detectedTableName}</strong> ·
								{parsedPreview.columns.length} colonnes ·
								{parsedPreview.rowCount} ligne{parsedPreview.rowCount > 1 ? 's' : ''}
							</span>
						</div>
					{/if}

					<!-- Info BDD -->
					<div class="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
						<p class="text-sm text-blue-700">
							Base cible : <strong>{dbLabels[selectedDatabase]}</strong>
						</p>
					</div>

					<!-- Aperçu colonnes -->
					<div class="mb-6 rounded-lg border bg-gray-50 p-4">
						<h3 class="mb-2 font-medium">
							Colonnes détectées ({parsedPreview.columns.length}) :
						</h3>
						<div class="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
							{#each parsedPreview.columns as col (col.header)}
								<div>
									<span class="font-medium">{col.header}:</span>
									<span class="text-gray-700">{col.value || '(vide)'}</span>
								</div>
							{/each}
						</div>
					</div>

					<!-- Formulaire validation -->
					<form
						method="POST"
						action="?/validate"
						use:enhance={({ cancel }) => {
							if (isProcessing) {
								cancel();
								return;
							}
							validationReceived = true;
							isProcessing = true;
							return async ({ update }) => {
								await update();
							};
						}}
					>
						<input type="hidden" name="csv" value={csvContent} />
						<input type="hidden" name="database" value={selectedDatabase} />
						<div class="flex justify-between">
							<Button variant="noir" onclick={resetImport}>
								<CircleArrowLeft class="mr-2 h-4 w-4" />
								Retour
							</Button>
							<Button type="submit" variant="vert" disabled={isProcessing}>
								{isProcessing ? 'Validation...' : 'Valider'}
								<CircleArrowRight class="ml-2 h-4 w-4" />
							</Button>
						</div>
					</form>
				</div>
			{:else if step === 3 && form?.validation}
				<!-- ÉTAPE 3 : Validation -->
				<div>
					<h2 class="mb-4 text-xl font-semibold text-black">3. Résultats validation</h2>

					<!-- Infos table -->
					<div class="mb-4 flex flex-wrap gap-2">
						<span class="rounded bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
							{form.validation.schemaName}.{form.validation.tableName}
						</span>
					</div>

					<!-- Stats -->
					<div class="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
						<div class="rounded-lg border border-blue-200 bg-blue-50 p-4 text-center">
							<div class="text-2xl font-bold text-blue-600">
								{form.validation.totalRows}
							</div>
							<div class="text-sm text-blue-800">Lignes détectées</div>
						</div>
						<div class="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
							<div class="text-2xl font-bold text-green-600">
								{form.validation.validRows}
							</div>
							<div class="text-sm text-green-800">Lignes valides</div>
						</div>
						<div class="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
							<div class="text-2xl font-bold text-red-600">
								{form.validation.errors.length}
							</div>
							<div class="text-sm text-red-800">Erreurs</div>
						</div>
					</div>


					<!-- Erreurs -->
					{#if form.validation.errors.length > 0}
						<div class="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
							<h3 class="mb-2 font-medium text-red-800">Erreurs de validation :</h3>
							<div class="max-h-64 overflow-y-auto">
								{#each form.validation.errors as error, i (i)}
									<div class="mb-2 rounded bg-white p-2 text-sm">
										<div class="flex items-center gap-2">
											<AlertCircle class="h-4 w-4 text-red-500" />
											<span class="font-medium">Ligne {error.line}, colonne "{error.col}" :</span>
										</div>
										<div class="ml-6 text-gray-600">{error.message}</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Bouton import -->
					<form
						method="POST"
						action="?/process"
						use:enhance={({ cancel }) => {
							if (isProcessing) {
								cancel();
								return;
							}
							resultReceived = true;
							isProcessing = true;
							return async ({ update }) => {
								await update();
							};
						}}
					>
						<input type="hidden" name="csv" value={csvContent} />
						<input type="hidden" name="database" value={selectedDatabase} />
						<div class="flex justify-between">
							<Button variant="noir" onclick={() => (step = 2)} disabled={isProcessing}>
								<CircleArrowLeft class="mr-2 h-4 w-4" />
								Retour
							</Button>
							<Button
								type="submit"
								variant={form.validation.validRows > 0 ? 'vert' : 'noir'}
								disabled={form.validation.validRows === 0 || isProcessing}
							>
								{#if isProcessing}
									<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
									Import en cours...
								{:else}
									Importer {form.validation.validRows} ligne{form.validation.validRows > 1 ? 's' : ''}
									<CircleArrowRight class="ml-2 h-4 w-4" />
								{/if}
							</Button>
						</div>
					</form>
				</div>
			{:else if step === 4 && form?.result}
				<!-- ÉTAPE 4 : Résultat -->
				<div>
					<div class="rounded-lg border border-green-200 bg-green-50 p-6">
						<div class="mb-4 text-center">
							<Check class="mx-auto mb-2 h-12 w-12 text-green-500" />
							<h3 class="mb-1 text-xl font-medium text-green-800">Import terminé !</h3>
							<p class="text-sm text-green-700">
								Table : <strong>{detectedTableName}</strong> · Base :
								<strong>{dbLabels[selectedDatabase]}</strong>
							</p>
						</div>

						<div class="mb-4 flex flex-wrap justify-center gap-3 text-sm">
							{#if form.result.inserted > 0}
								<div class="min-w-48 rounded bg-white p-3 text-center shadow-sm">
									<div class="text-xs text-gray-600">Lignes inserees / mises a jour</div>
									<div class="text-2xl font-bold text-green-600">
										{form.result.inserted}
									</div>
								</div>
							{/if}
							{#if form.result.errors.length > 0}
								<div class="min-w-48 rounded bg-white p-3 text-center shadow-sm">
									<div class="text-xs text-gray-600">Erreurs</div>
									<div class="text-2xl font-bold text-red-600">
										{form.result.errors.length}
									</div>
								</div>
							{/if}
							{#if form.result.inserted === 0 && form.result.errors.length === 0}
								<div class="rounded bg-white p-3 text-center shadow-sm">
									<div class="text-sm text-gray-500">Aucune modification (donnees deja a jour)</div>
								</div>
							{/if}
						</div>

						{#if form.result.errors.length > 0}
							<div class="mb-4 rounded border border-red-200 bg-red-50 p-3">
								<p class="text-sm font-medium text-red-800">Erreurs :</p>
								{#each form.result.errors as err, i (i)}
									<div class="text-sm text-red-700">Ligne {err.line} : {err.error}</div>
								{/each}
							</div>
						{/if}

						<div class="flex justify-center">
							<Button variant="vert" onclick={resetImport}>
								<Upload class="mr-2 h-4 w-4" />
								Nouvel import
							</Button>
						</div>
					</div>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
