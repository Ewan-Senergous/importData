<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';

	export const badgeVariants = tv({
		base: 'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-sm border px-2.5 py-0.5 text-xs font-medium transition-[color,box-shadow] [&>svg]:pointer-events-none [&>svg]:size-3',
		variants: {
			variant: {
				default: 'bg-primary text-primary-foreground [a&]:hover:bg-primary/90 border-transparent',
				rouge: 'bg-red-100 text-red-800 border-red-400 dark:bg-gray-700 dark:text-red-400',
				vert: 'bg-green-100 text-green-800 border-green-400 dark:bg-gray-700 dark:text-green-400',
				bleu: 'bg-blue-100 text-blue-800 border-blue-400 dark:bg-gray-700 dark:text-blue-400',
				noir: 'bg-gray-100 text-gray-800 border-gray-400 dark:bg-gray-700 dark:text-gray-400',
				blanc:
					'bg-white text-gray-800 border-gray-300 dark:bg-gray-800 dark:text-white dark:border-gray-600',
				orange:
					'bg-orange-100 text-orange-800 border-orange-400 dark:bg-gray-700 dark:text-orange-400',
				jaune:
					'bg-yellow-100 text-yellow-800 border-yellow-400 dark:bg-gray-700 dark:text-yellow-400',
				cyan: 'bg-cyan-100 text-cyan-800 border-cyan-400 dark:bg-gray-700 dark:text-cyan-400',
				purple:
					'bg-purple-100 text-purple-800 border-purple-400 dark:bg-gray-700 dark:text-purple-400',
				lime: 'bg-lime-100 text-lime-800 border-lime-400 dark:bg-gray-700 dark:text-lime-400'
			}
		},
		defaultVariants: {
			variant: 'default'
		}
	});

	export type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];
</script>

<script lang="ts">
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		href,
		class: className,
		variant = 'default',
		children,
		...restProps
	}: WithElementRef<HTMLAnchorAttributes> & {
		variant?: BadgeVariant;
	} = $props();
</script>

<svelte:element
	this={href ? 'a' : 'span'}
	bind:this={ref}
	data-slot="badge"
	{href}
	class={cn(badgeVariants({ variant }), className)}
	{...restProps}
>
	{@render children?.()}
</svelte:element>
