<script lang="ts">
	import { read, utils } from 'xlsx';
	import { fade } from 'svelte/transition';
	import { superForm } from 'sveltekit-superforms/client';
	import {
		Button,
		Card,
		Table,
		TableBody,
		TableBodyCell,
		TableBodyRow,
		TableHead,
		TableHeadCell,
		Alert,
		Progressbar,
		Select,
		Spinner,
		Fileupload
	} from 'flowbite-svelte';
	import {
		Upload,
		Database,
		FileCheck,
		AlertCircle,
		ArrowRight,
		CornerDownRight,
		Check,
		X
	} from 'lucide-svelte';

	export let data;

	// Définition du type de résultat attendu
	type ValidationResult = {
		totalRows: number;
		validRows: number;
		duplicates: number;
		invalidData: { row: number; field: string; value: string; error: string }[];
		processed: boolean;
		inserted?: number;
		updated?: number;
		errors?: string[];
	};

	// Initialisation du formulaire avec SuperForms
	const {
		form,
		enhance: superEnhance,
		submitting,
		errors,
		reset
	} = superForm(data.form, {
		dataType: 'json',
		onUpdated: ({ form }) => {
			console.log('Formulaire mis à jour:', form);

			if (form && form.data && 'result' in form.data) {
				const result = form.data.result as ValidationResult;
				console.log('Résultat traité correctement:', result);
				updateFormWithResult(result);

				if (result.processed) {
					step = 3; // Importation terminée
				} else if (step === 2) {
					step = 3; // Validation terminée, prêt pour l'importation
				}
			}
		},
		onError: (event) => {
			console.error('Erreur de soumission:', event);
			// Gestion des erreurs avec conversion de type appropriée
			const errorResult = event.result as unknown as {
				error?: string | { message: string } | Error;
			};

			// Extraction du message d'erreur selon le type
			let errorMsg = 'Une erreur est survenue';

			if (errorResult?.error) {
				if (typeof errorResult.error === 'string') {
					errorMsg = errorResult.error;
				} else if (typeof errorResult.error === 'object' && 'message' in errorResult.error) {
					errorMsg = errorResult.error.message;
				}
			}

			errorMessage = errorMsg;
		}
	});

	let dragActive = false;
	let isProcessing = false;
	let step = 1;
	let errorMessage = '';
	let file: File | null = null;
	let fileName = '';
	let rawData: any[] = [];
	let headers: string[] = [];
	let previewData: any[] = [];
	let targetTable = 'attribute_dev'; // Par défaut
	let mappedFields: Record<string, string> = {};
	let hasHeaders = true; // Détection automatique
	let showNoHeaderAlert = false; // Nouvelle variable pour l'alerte
	let availableTables = [
		{ value: 'attribute', name: 'Attributs' },
		{ value: 'attribute_dev', name: 'Attributs (Dev)' },
		{ value: 'supplier', name: 'Fournisseurs' },
		{ value: 'v_categories', name: 'Catégories' }
	];

	let tableFields: Record<string, string[]> = {
		attribute: ['atr_nat', 'atr_val', 'atr_label'],
		attribute_dev: ['atr_nat', 'atr_val', 'atr_label'],
		supplier: ['sup_code', 'sup_label'],
		v_categories: [
			'atr_0_label',
			'atr_1_label',
			'atr_2_label',
			'atr_3_label',
			'atr_4_label',
			'atr_5_label',
			'atr_6_label',
			'atr_7_label'
		]
	};

	// Utilisons le type défini précédemment
	let validationResults: ValidationResult = {
		totalRows: 0,
		validRows: 0,
		duplicates: 0,
		invalidData: [],
		processed: false
	};

	// Gestion du drag and drop
	function handleDragEnter(e: DragEvent) {
		e.preventDefault();
		dragActive = true;
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		dragActive = false;
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		dragActive = true;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragActive = false;

		if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
			handleFiles(e.dataTransfer.files);
		}
	}

	function handleFileInput(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files && input.files.length > 0) {
			handleFiles(input.files);
		}
	}

	function handleFiles(files: FileList) {
		file = files[0];
		fileName = file.name;

		// Vérification du type de fichier
		if (!fileName.endsWith('.csv') && !fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
			errorMessage = 'Format de fichier non supporté. Veuillez utiliser un fichier CSV ou Excel.';
			file = null;
			return;
		}

		errorMessage = '';
		readFile();
	}

	function readFile() {
		if (!file) return;

		isProcessing = true;
		const reader = new FileReader();

		reader.onload = (e) => {
			try {
				const result = e.target?.result;
				if (!result) throw new Error('Échec de lecture du fichier');

				console.log('Type de fichier:', file?.type);
				console.log('Nom du fichier:', file?.name);

				const workbook = read(result, { type: 'array' });
				console.log('Workbook créé:', workbook);

				const firstSheetName = workbook.SheetNames[0];
				console.log('Nom de la première feuille:', firstSheetName);

				const worksheet = workbook.Sheets[firstSheetName];
				console.log('Worksheet:', worksheet);

				rawData = utils.sheet_to_json(worksheet, { header: 1 });
				console.log('Données brutes:', rawData);

				if (rawData.length < 1) {
					throw new Error('Le fichier ne contient pas de données');
				}

				// Détection automatique des en-têtes
				hasHeaders = detectHeaders(rawData);
				showNoHeaderAlert = !hasHeaders;

				if (hasHeaders) {
					// Mode avec en-têtes (comportement normal)
					if (rawData.length < 2) {
						throw new Error(
							'Le fichier ne contient pas assez de données (en-têtes + au moins 1 ligne)'
						);
					}
					headers = rawData[0] as string[];
					previewData = rawData.slice(1, Math.min(rawData.length, 6)) as any[];
				} else {
					// Mode sans en-têtes - générer des en-têtes génériques
					const firstRow = rawData[0] as any[];
					headers = firstRow.map((_, index) => `Colonne ${index + 1}`);
					previewData = rawData.slice(0, Math.min(rawData.length, 5)) as any[];
				}

				console.log('En-têtes:', headers);
				console.log('Mode avec en-têtes:', hasHeaders);

				// Mappage automatique des champs
				guessFieldMapping();

				// Mise à jour du formulaire SuperForms
				const formData = {
					data: hasHeaders ? rawData.slice(1) : rawData, // Exclure les en-têtes seulement si présents
					mappedFields,
					targetTable
				};
				console.log('Données du formulaire à envoyer:', formData);
				$form = formData;

				step = 2;
			} catch (err) {
				console.error('Erreur détaillée:', err);
				errorMessage = `Erreur lors de la lecture du fichier: ${err instanceof Error ? err.message : 'Erreur inconnue'}`;
			} finally {
				isProcessing = false;
			}
		};

		reader.onerror = () => {
			console.error('Erreur de lecture du fichier');
			errorMessage = 'Échec de lecture du fichier';
			isProcessing = false;
		};

		reader.readAsArrayBuffer(file);
	}

	// Nouvelle fonction pour détecter automatiquement les en-têtes
	function detectHeaders(data: any[][]): boolean {
		if (data.length < 2) return false;

		const firstRow = data[0];
		const secondRow = data[1];

		// Vérifier si la première ligne contient des chaînes qui ressemblent à des noms de champs
		const hasStringHeaders = firstRow.every((cell, index) => {
			if (typeof cell !== 'string') return false;

			// Vérifier si c'est un nom de champ connu
			const knownFields = [
				...tableFields.attribute,
				...tableFields.supplier,
				...tableFields.v_categories
			];
			const normalizedCell = String(cell)
				.toLowerCase()
				.replace(/[^a-z0-9]/g, '');

			return knownFields.some((field) => {
				const normalizedField = field.toLowerCase().replace(/[^a-z0-9]/g, '');
				return normalizedCell.includes(normalizedField) || normalizedField.includes(normalizedCell);
			});
		});

		// Si pas de correspondance avec des champs connus, vérifier si la première ligne a un type différent de la seconde
		if (!hasStringHeaders && secondRow) {
			const firstRowTypes = firstRow.map((cell) => typeof cell);
			const secondRowTypes = secondRow.map((cell) => typeof cell);

			// Si les types sont différents, probablement des en-têtes
			const typesDifferent = firstRowTypes.some((type, index) => type !== secondRowTypes[index]);
			return typesDifferent;
		}

		return hasStringHeaders;
	}

	function guessFieldMapping() {
		console.log('Début du mappage des champs');
		console.log('En-têtes à mapper:', headers);
		console.log('Champs disponibles:', tableFields[targetTable]);

		mappedFields = {};
		const fields = tableFields[targetTable];

		if (hasHeaders) {
			// Mappage automatique basé sur les en-têtes
			headers.forEach((header, index) => {
				// Normalisation pour la comparaison
				const normalizedHeader = String(header)
					.toLowerCase()
					.replace(/[^a-z0-9]/g, '');

				// Recherche du meilleur match
				let bestMatch = '';
				let bestScore = 0;

				fields.forEach((field) => {
					const normalizedField = field.toLowerCase().replace(/[^a-z0-9]/g, '');

					if (
						normalizedHeader.includes(normalizedField) ||
						normalizedField.includes(normalizedHeader)
					) {
						const score =
							Math.min(normalizedHeader.length, normalizedField.length) /
							Math.max(normalizedHeader.length, normalizedField.length);

						if (score > bestScore) {
							bestScore = score;
							bestMatch = field;
						}
					}
				});

				if (bestScore > 0.5) {
					mappedFields[index.toString()] = bestMatch;
				}
			});
		}
		// Si pas d'en-têtes, le mappage sera fait manuellement par l'utilisateur

		console.log('Mappage final:', mappedFields);
	}

	function handleTableChange() {
		// Réinitialiser le mappage lors du changement de table
		mappedFields = {};
		guessFieldMapping();

		// Mise à jour du formulaire
		$form.targetTable = targetTable;
		$form.mappedFields = mappedFields;
	}

	function getRequiredFields(): string[] {
		if (targetTable === 'attribute' || targetTable === 'attribute_dev') {
			return ['atr_nat', 'atr_val'];
		} else if (targetTable === 'supplier') {
			return ['sup_code'];
		} else if (targetTable === 'v_categories') {
			return ['atr_0_label'];
		}
		return [];
	}

	function isFieldMapped(fieldName: string): boolean {
		return Object.values(mappedFields).includes(fieldName);
	}

	function resetImport() {
		file = null;
		fileName = '';
		rawData = [];
		headers = [];
		previewData = [];
		mappedFields = {};
		hasHeaders = true;
		showNoHeaderAlert = false;
		validationResults = {
			totalRows: 0,
			validRows: 0,
			duplicates: 0,
			invalidData: [],
			processed: false
		};
		step = 1;
		errorMessage = '';

		// Réinitialiser le formulaire SuperForms
		reset();
	}

	function updateFormWithResult(result: ValidationResult) {
		validationResults = result;
		$form = {
			data: hasHeaders ? rawData.slice(1) : rawData,
			mappedFields,
			targetTable
		};
	}
</script>

<div class="mx-auto my-8 max-w-6xl">
	<h1 class="mb-6 text-2xl font-bold">Importation de données</h1>

	{#if errorMessage}
		<Alert color="red" class="mb-4">
			<AlertCircle slot="icon" class="h-4 w-4" />
			{errorMessage}
		</Alert>
	{/if}

	<div class="steps mb-8 flex justify-between">
		<div class={`step-item ${step >= 1 ? 'text-blue-700' : ''} flex-1`}>
			<div class="flex items-center">
				<div
					class={`mr-2 flex h-8 w-8 items-center justify-center rounded-full ${step >= 1 ? 'bg-blue-100 text-blue-700' : 'bg-gray-200'}`}
				>
					1
				</div>
				<span>Sélection du fichier</span>
			</div>
		</div>
		<div class="step-separator mx-4 h-px flex-1 self-center bg-gray-300"></div>
		<div class={`step-item ${step >= 2 ? 'text-blue-700' : ''} flex-1`}>
			<div class="flex items-center">
				<div
					class={`mr-2 flex h-8 w-8 items-center justify-center rounded-full ${step >= 2 ? 'bg-blue-100 text-blue-700' : 'bg-gray-200'}`}
				>
					2
				</div>
				<span>Mappage des colonnes</span>
			</div>
		</div>
		<div class="step-separator mx-4 h-px flex-1 self-center bg-gray-300"></div>
		<div class={`step-item ${step >= 3 ? 'text-blue-700' : ''} flex-1`}>
			<div class="flex items-center">
				<div
					class={`mr-2 flex h-8 w-8 items-center justify-center rounded-full ${step >= 3 ? 'bg-blue-100 text-blue-700' : 'bg-gray-200'}`}
				>
					3
				</div>
				<span>Validation & Import</span>
			</div>
		</div>
	</div>

	<Card class="mx-auto w-full max-w-6xl">
		{#if step === 1}
			<div class="mb-6">
				<h2 class="mb-2 text-xl font-semibold">Sélection du fichier</h2>
				<p class="mb-4 text-gray-600">
					Sélectionnez un fichier CSV ou Excel contenant les données à importer.
				</p>

				<!-- Zone de drop -->
				<div
					role="button"
					tabindex="0"
					class={`mb-4 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}`}
					on:dragenter|preventDefault={handleDragEnter}
					on:dragleave|preventDefault={handleDragLeave}
					on:dragover|preventDefault={handleDragOver}
					on:drop|preventDefault={handleDrop}
				>
					<div class="flex flex-col items-center">
						<Upload class="mx-auto mb-2 h-12 w-12 text-gray-400" />
						<p class="mb-2 text-lg">Glissez-déposez votre fichier ici</p>
						<p class="mb-4 text-sm text-gray-500">ou</p>
						<div class="flex flex-col items-center">
							<input
								type="file"
								id="fileInput"
								class="hidden"
								accept=".csv,.xlsx,.xls"
								on:change={handleFileInput}
							/>
							<Button
								color="blue"
								on:click={() => {
									document.getElementById('fileInput')?.click();
								}}
							>
								<Upload class="mr-2 h-5 w-5" />
								Parcourir les fichiers
							</Button>
						</div>
					</div>
				</div>

				{#if file}
					<div class="mt-4 flex items-center justify-between rounded-lg bg-gray-50 p-4">
						<div class="flex items-center">
							<FileCheck class="mr-2 h-6 w-6 text-green-500" />
							<div>
								<p class="font-medium">{fileName}</p>
								<p class="text-sm text-gray-500">{(file.size / 1024).toFixed(2)} Ko</p>
							</div>
						</div>
						<Button color="blue" on:click={readFile}>
							Continuer <ArrowRight class="ml-2 h-4 w-4" />
						</Button>
					</div>
				{/if}
			</div>
		{:else if step === 2}
			<form method="POST" action="?/validate" use:superEnhance>
				<div class="mb-6">
					<h2 class="mb-4 text-xl font-semibold">Mappage des colonnes</h2>

					{#if showNoHeaderAlert}
						<Alert color="red" class="mb-4">
							<AlertCircle slot="icon" class="h-4 w-4" />
							<strong>Attention :</strong> Les données importées n'ont pas d'en-têtes. Les colonnes ont
							été nommées automatiquement.
						</Alert>
					{/if}

					<div class="mb-6">
						<label for="targetTable" class="mb-2 block font-medium text-gray-700"
							>Table de destination</label
						>
						<Select
							id="targetTable"
							bind:value={targetTable}
							on:change={handleTableChange}
							class="w-full md:w-1/2"
						>
							{#each availableTables as table}
								<option value={table.value}>{table.name}</option>
							{/each}
						</Select>
					</div>

					<h3 class="mb-2 font-medium">Aperçu des données</h3>
					<div class="mb-6 overflow-x-auto">
						<Table>
							<TableHead>
								{#each headers as header, i}
									<TableHeadCell>
										<div class="mb-2">{header}</div>
										<Select
											bind:value={mappedFields[i.toString()]}
											on:change={() => ($form.mappedFields = mappedFields)}
											class="min-w-[12rem] text-sm"
										>
											<option value="">Ne pas importer</option>
											{#each tableFields[targetTable] as field}
												<option value={field}>{field}</option>
											{/each}
										</Select>
									</TableHeadCell>
								{/each}
							</TableHead>
							<TableBody>
								{#each previewData as row}
									<TableBodyRow>
										{#each headers as _, i}
											<TableBodyCell>
												{row[i] !== undefined ? row[i] : ''}
											</TableBodyCell>
										{/each}
									</TableBodyRow>
								{/each}
							</TableBody>
						</Table>
					</div>

					<!-- Champs requis -->
					<div class="mb-6">
						<h3 class="mb-2 font-medium">Champs requis</h3>
						<div class="flex flex-wrap gap-2">
							{#each getRequiredFields() as field}
								<div
									class={`rounded-full px-3 py-1 text-sm font-medium ${isFieldMapped(field) ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
								>
									{#if isFieldMapped(field)}
										<Check class="mr-1 inline h-4 w-4" />
									{:else}
										<X class="mr-1 inline h-4 w-4" />
									{/if}
									{field}
								</div>
							{/each}
						</div>
					</div>

					<!-- Champs cachés pour le formulaire -->
					<input type="hidden" name="data" value={JSON.stringify($form.data)} />
					<input type="hidden" name="mappedFields" value={JSON.stringify(mappedFields)} />
					<input type="hidden" name="targetTable" value={targetTable} />

					<div class="flex justify-between">
						<Button color="light" on:click={resetImport}>Retour</Button>
						<Button
							type="submit"
							color="blue"
							disabled={getRequiredFields().some((field) => !isFieldMapped(field)) || $submitting}
						>
							{#if $submitting}
								<Spinner class="mr-2 h-4 w-4" />
								Validation en cours...
							{:else}
								Valider les données
							{/if}
						</Button>
					</div>
				</div>
			</form>
		{:else if step === 3}
			<div class="mb-6">
				<h2 class="mb-4 text-xl font-semibold">Validation et importation</h2>

				{#if !validationResults.processed}
					<div class="mb-4 rounded-md border border-blue-200 bg-blue-50 p-4">
						<h3 class="mb-2 font-medium text-blue-800">Résumé de la validation</h3>
						<ul class="space-y-2">
							<li class="flex items-center">
								<CornerDownRight class="mr-2 h-4 w-4 text-gray-500" />
								Lignes totales :
								<span class="ml-1 font-semibold">{validationResults.totalRows}</span>
							</li>
							<li class="flex items-center">
								<CornerDownRight class="mr-2 h-4 w-4 text-gray-500" />
								Lignes valides :
								<span class="ml-1 font-semibold text-green-600">{validationResults.validRows}</span>
							</li>
							<li class="flex items-center">
								<CornerDownRight class="mr-2 h-4 w-4 text-gray-500" />
								Doublons détectés :
								<span class="ml-1 font-semibold text-amber-600">{validationResults.duplicates}</span
								>
							</li>
							<li class="flex items-center">
								<CornerDownRight class="mr-2 h-4 w-4 text-gray-500" />
								Erreurs de validation :
								<span class="ml-1 font-semibold text-red-600"
									>{validationResults.invalidData.length}</span
								>
							</li>
						</ul>
					</div>

					{#if validationResults.invalidData.length > 0}
						<div class="mb-6">
							<h3 class="mb-2 font-medium">Erreurs de validation</h3>
							<div class="overflow-x-auto">
								<Table>
									<TableHead>
										<TableHeadCell>Ligne</TableHeadCell>
										<TableHeadCell>Champ</TableHeadCell>
										<TableHeadCell>Valeur</TableHeadCell>
										<TableHeadCell>Erreur</TableHeadCell>
									</TableHead>
									<TableBody>
										{#each validationResults.invalidData as error}
											<TableBodyRow>
												<TableBodyCell>{error.row + 1}</TableBodyCell>
												<TableBodyCell>{error.field}</TableBodyCell>
												<TableBodyCell>{error.value}</TableBodyCell>
												<TableBodyCell>{error.error}</TableBodyCell>
											</TableBodyRow>
										{/each}
									</TableBody>
								</Table>
							</div>
						</div>
					{/if}

					<form method="POST" action="?/process" use:superEnhance>
						<!-- Champs cachés pour le formulaire -->
						<input type="hidden" name="data" value={JSON.stringify($form.data)} />
						<input type="hidden" name="mappedFields" value={JSON.stringify(mappedFields)} />
						<input type="hidden" name="targetTable" value={targetTable} />

						<div class="flex justify-between">
							<Button color="light" on:click={() => (step = 2)}>Retour</Button>
							<Button
								type="submit"
								color={validationResults.validRows > 0 ? 'blue' : 'light'}
								disabled={validationResults.validRows === 0 || $submitting}
							>
								{#if $submitting}
									<Spinner class="mr-2 h-4 w-4" />
									Importation en cours...
								{:else}
									Importer {validationResults.validRows} lignes
								{/if}
							</Button>
						</div>
					</form>
				{:else}
					<div class="rounded-md border border-green-200 bg-green-50 p-6 text-center">
						<Check class="mx-auto mb-2 h-12 w-12 text-green-500" />
						<h3 class="mb-2 text-xl font-medium text-green-800">
							Importation terminée avec succès
						</h3>
						<p class="mb-4">
							{validationResults.validRows} lignes ont été importées dans la table {targetTable}.
							{#if validationResults.inserted && validationResults.updated}
								({validationResults.inserted} insertions et {validationResults.updated} mises à jour)
							{/if}
						</p>
						<Button color="blue" on:click={resetImport}>Nouvelle importation</Button>
					</div>
				{/if}
			</div>
		{/if}
	</Card>

	{#if isProcessing || ($submitting && !isProcessing)}
		<div
			transition:fade
			class="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black"
		>
			<div class="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
				<Spinner class="mx-auto mb-4" size="xl" />
				<p class="text-center font-medium">Traitement en cours...</p>
			</div>
		</div>
	{/if}
</div>
