<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { Badge } from '$lib/components/ui/badge';
	import { Database, Folder, Table, Eye, ChevronRight, ChevronDown } from 'lucide-svelte';
	import type { TableInfo } from '$lib/prisma-meta';
	import {
		groupTablesByHierarchy,
		getDatabaseLabel,
		getDatabaseBadgeVariant,
		type TableSelection
	} from './explorer.service';

	interface Props {
		allTables: TableInfo[];
	}

	let { allTables }: Props = $props();

	const dispatch = createEventDispatcher<{
		tableSelect: TableSelection;
	}>();

	// Grouper les tables par hiérarchie
	let hierarchy = $derived(groupTablesByHierarchy(allTables));

	// États d'expansion SIMPLES - juste des Sets
	let openDatabases = $state(new Set<string>());
	let openSchemas = $state(new Set<string>());
	let openCategories = $state(new Set<string>());

	function toggleDatabase(key: string) {
		// Svelte 5 : créer un nouveau Set pour déclencher la réactivité
		if (openDatabases.has(key)) {
			openDatabases = new Set([...openDatabases].filter((k) => k !== key));
		} else {
			openDatabases = new Set([...openDatabases, key]);
		}
	}

	function toggleSchema(key: string) {
		// Svelte 5 : créer un nouveau Set pour déclencher la réactivité
		if (openSchemas.has(key)) {
			openSchemas = new Set([...openSchemas].filter((k) => k !== key));
		} else {
			openSchemas = new Set([...openSchemas, key]);
		}
	}

	function toggleCategory(key: string) {
		// Svelte 5 : créer un nouveau Set pour déclencher la réactivité
		if (openCategories.has(key)) {
			openCategories = new Set([...openCategories].filter((k) => k !== key));
		} else {
			openCategories = new Set([...openCategories, key]);
		}
	}

	function selectTable(database: string, schema: string, tableName: string) {
		dispatch('tableSelect', { database, schema, tableName });
	}
</script>

<Sidebar.Root>
	<Sidebar.Content>
		<Sidebar.Group>
			<Sidebar.GroupLabel>Bases de données</Sidebar.GroupLabel>
			<Sidebar.GroupContent>
				<Sidebar.Menu>
					{#each Object.entries(hierarchy) as [database, schemas] (database)}
						<Sidebar.MenuItem>
							<!-- Database Header -->
							<button
								onclick={() => toggleDatabase(database)}
								class="hover:bg-accent flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2.5"
							>
								<div class="flex items-center gap-2">
									{#if openDatabases.has(database)}
										<ChevronDown class="size-4" />
									{:else}
										<ChevronRight class="size-4" />
									{/if}
									<Database class="size-4" />
									<span class="font-medium">{getDatabaseLabel(database)}</span>
								</div>
								<Badge variant={getDatabaseBadgeVariant(database)}>
									{Object.values(schemas).reduce(
										(total, schema) => total + schema.tables.length + schema.views.length,
										0
									)}
								</Badge>
							</button>

							<!-- Database Content -->
							{#if openDatabases.has(database)}
								<div class="mt-1 ml-4 space-y-1">
									{#each Object.entries(schemas) as [schema, { tables, views }] (`${database}-${schema}`)}
										<!-- Schema Header -->
										<button
											onclick={() => toggleSchema(`${database}-${schema}`)}
											class="hover:bg-accent flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2"
										>
											<div class="flex items-center gap-2">
												{#if openSchemas.has(`${database}-${schema}`)}
													<ChevronDown class="size-3.5" />
												{:else}
													<ChevronRight class="size-3.5" />
												{/if}
												<Folder class="size-3.5" />
												<span class="text-sm">{schema}</span>
											</div>
											<Badge variant="noir">
												{tables.length + views.length}
											</Badge>
										</button>

										<!-- Schema Content -->
										{#if openSchemas.has(`${database}-${schema}`)}
											<div class="mt-1 ml-4 space-y-1">
												<!-- Tables Section -->
												{#if tables.length > 0}
													<button
														onclick={() => toggleCategory(`${database}-${schema}-tables`)}
														class="hover:bg-accent flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-xs"
													>
														<div class="flex items-center gap-1.5">
															{#if openCategories.has(`${database}-${schema}-tables`)}
																<ChevronDown class="size-3" />
															{:else}
																<ChevronRight class="size-3" />
															{/if}
															<Table class="size-3" />
															<span>Tables</span>
														</div>
														<Badge variant="bleu">
															{tables.length}
														</Badge>
													</button>

													{#if openCategories.has(`${database}-${schema}-tables`)}
														<div class="mt-1 ml-3 space-y-0.5">
															{#each tables as table (table.name)}
																<Sidebar.MenuButton
																	onclick={() => selectTable(database, schema, table.name)}
																	class="hover:bg-accent w-full cursor-pointer justify-start px-3 py-2 text-xs"
																>
																	<Table class="size-3" />
																	{table.name}
																</Sidebar.MenuButton>
															{/each}
														</div>
													{/if}
												{/if}

												<!-- Views Section -->
												{#if views.length > 0}
													<button
														onclick={() => toggleCategory(`${database}-${schema}-views`)}
														class="hover:bg-accent flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-xs"
													>
														<div class="flex items-center gap-1.5">
															{#if openCategories.has(`${database}-${schema}-views`)}
																<ChevronDown class="size-3" />
															{:else}
																<ChevronRight class="size-3" />
															{/if}
															<Eye class="size-3" />
															<span>Vues</span>
														</div>
														<Badge variant="vert">
															{views.length}
														</Badge>
													</button>

													{#if openCategories.has(`${database}-${schema}-views`)}
														<div class="mt-1 ml-3 space-y-0.5">
															{#each views as view (view.name)}
																<Sidebar.MenuButton
																	onclick={() => selectTable(database, schema, view.name)}
																	class="hover:bg-accent w-full cursor-pointer justify-start px-3 py-2 text-xs"
																>
																	<Eye class="size-3" />
																	{view.name}
																</Sidebar.MenuButton>
															{/each}
														</div>
													{/if}
												{/if}
											</div>
										{/if}
									{/each}
								</div>
							{/if}
						</Sidebar.MenuItem>
					{/each}
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>
	</Sidebar.Content>
</Sidebar.Root>
