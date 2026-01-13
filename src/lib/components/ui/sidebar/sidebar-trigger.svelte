<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils.js';
	import SquareChevronLeft from '@lucide/svelte/icons/square-chevron-left';
	import SquareChevronRight from '@lucide/svelte/icons/square-chevron-right';
	import type { ComponentProps } from 'svelte';
	import { useSidebar } from './context.svelte.js';

	let {
		ref = $bindable(null),
		class: className,
		onclick,
		...restProps
	}: ComponentProps<typeof Button> & {
		onclick?: (e: MouseEvent) => void;
	} = $props();

	const sidebar = useSidebar();
</script>

<Button
	data-sidebar="trigger"
	data-slot="sidebar-trigger"
	variant="blanc"
	size="icon"
	class={cn('size-7', className)}
	type="button"
	onclick={(e) => {
		onclick?.(e);
		sidebar.toggle();
	}}
	{...restProps}
>
	{#if sidebar.open}
		<SquareChevronLeft />
	{:else}
		<SquareChevronRight />
	{/if}
	<span class="sr-only">Toggle Sidebar</span>
</Button>
