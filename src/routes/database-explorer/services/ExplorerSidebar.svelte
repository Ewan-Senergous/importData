<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { Badge } from '$lib/components/ui/badge';
	import { Database, Folder, Table, Eye } from 'lucide-svelte';
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

	// États d'expansion des collapsibles
	let expandedDatabases = $state<Set<string>>(new Set());
	let expandedSchemas = $state<Set<string>>(new Set());
	let expandedCategories = $state<Set<string>>(new Set());

	function toggleDatabase(database: string) {
		if (expandedDatabases.has(database)) {
			expandedDatabases.delete(database);
		} else {
			expandedDatabases.add(database);
		}
		expandedDatabases = new Set(expandedDatabases);
	}

	function toggleSchema(key: string) {
		if (expandedSchemas.has(key)) {
			expandedSchemas.delete(key);
		} else {
			expandedSchemas.add(key);
		}
		expandedSchemas = new Set(expandedSchemas);
	}

	function toggleCategory(key: string) {
		if (expandedCategories.has(key)) {
			expandedCategories.delete(key);
		} else {
			expandedCategories.add(key);
		}
		expandedCategories = new Set(expandedCategories);
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
							<Collapsible.Root open={expandedDatabases.has(database)}>
								<Collapsible.Trigger
									onclick={() => toggleDatabase(database)}
									class="flex w-full items-center justify-between rounded-md px-3 py-2.5 hover:bg-accent cursor-pointer"
								>
									<div class="flex items-center gap-2">
										<Database class="size-4" />
										<span class="font-medium">{getDatabaseLabel(database)}</span>
									</div>
									<Badge variant={getDatabaseBadgeVariant(database)}>
										{Object.values(schemas).reduce(
											(total, schema) => total + schema.tables.length + schema.views.length,
											0
										)}
									</Badge>
								</Collapsible.Trigger>

								<Collapsible.Content class="ml-4 mt-1 space-y-1">
									{#each Object.entries(schemas) as [schema, { tables, views }] (`${database}-${schema}`)}
										<Collapsible.Root open={expandedSchemas.has(`${database}-${schema}`)}>
											<Collapsible.Trigger
												onclick={() => toggleSchema(`${database}-${schema}`)}
												class="flex w-full items-center justify-between rounded-md px-3 py-2 hover:bg-accent cursor-pointer"
											>
												<div class="flex items-center gap-2">
													<Folder class="size-3.5" />
													<span class="text-sm">{schema}</span>
												</div>
												<Badge variant="noir">
													{tables.length + views.length}
												</Badge>
											</Collapsible.Trigger>

											<Collapsible.Content class="ml-4 mt-1 space-y-1">
												<!-- Tables -->
												{#if tables.length > 0}
													<Collapsible.Root
														open={expandedCategories.has(`${database}-${schema}-tables`)}
													>
														<Collapsible.Trigger
															onclick={() =>
																toggleCategory(`${database}-${schema}-tables`)}
															class="flex w-full items-center justify-between rounded-md px-3 py-2 text-xs hover:bg-accent cursor-pointer"
														>
															<div class="flex items-center gap-1.5">
																<Table class="size-3" />
																<span>Tables</span>
															</div>
															<Badge variant="bleu">
																{tables.length}
															</Badge>
														</Collapsible.Trigger>

														<Collapsible.Content class="ml-3 mt-1 space-y-0.5">
															{#each tables as table (table.name)}
																<Sidebar.MenuButton
																	onclick={() =>
																		selectTable(database, schema, table.name)}
																	class="w-full justify-start text-xs hover:bg-accent cursor-pointer px-3 py-2"
																>
																	<Table class="size-3" />
																	{table.name}
																</Sidebar.MenuButton>
															{/each}
														</Collapsible.Content>
													</Collapsible.Root>
												{/if}

												<!-- Vues -->
												{#if views.length > 0}
													<Collapsible.Root
														open={expandedCategories.has(`${database}-${schema}-views`)}
													>
														<Collapsible.Trigger
															onclick={() => toggleCategory(`${database}-${schema}-views`)}
															class="flex w-full items-center justify-between rounded-md px-3 py-2 text-xs hover:bg-accent cursor-pointer"
														>
															<div class="flex items-center gap-1.5">
																<Eye class="size-3" />
																<span>Vues</span>
															</div>
															<Badge variant="vert">
																{views.length}
															</Badge>
														</Collapsible.Trigger>

														<Collapsible.Content class="ml-3 mt-1 space-y-0.5">
															{#each views as view (view.name)}
																<Sidebar.MenuButton
																	onclick={() =>
																		selectTable(database, schema, view.name)}
																	class="w-full justify-start text-xs hover:bg-accent cursor-pointer px-3 py-2"
																>
																	<Eye class="size-3" />
																	{view.name}
																</Sidebar.MenuButton>
															{/each}
														</Collapsible.Content>
													</Collapsible.Root>
												{/if}
											</Collapsible.Content>
										</Collapsible.Root>
									{/each}
								</Collapsible.Content>
							</Collapsible.Root>
						</Sidebar.MenuItem>
					{/each}
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>
	</Sidebar.Content>
</Sidebar.Root>