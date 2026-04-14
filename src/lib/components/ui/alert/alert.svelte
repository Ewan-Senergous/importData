<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';

	export const alertVariants = tv({
		base: 'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-3 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-2 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
		variants: {
			variant: {
				default: 'bg-card text-card-foreground',
				destructive:
					'text-red-800 bg-red-50 border-red-500 *:data-[slot=alert-description]:text-red-600 [&>svg]:text-current dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
				success:
					'text-green-800 bg-green-50 border-green-500 *:data-[slot=alert-description]:text-green-600 [&>svg]:text-current dark:bg-green-900/20 dark:text-green-400 dark:border-green-800',
				info: 'text-blue-800 bg-blue-50 border-blue-500 *:data-[slot=alert-description]:text-blue-600 [&>svg]:text-current dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800',
				warning:
					'text-yellow-900 bg-yellow-50 border-yellow-500 *:data-[slot=alert-description]:text-yellow-800 [&>svg]:text-current dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800'
			}
		},
		defaultVariants: {
			variant: 'default'
		}
	});

	export type AlertVariant = VariantProps<typeof alertVariants>['variant'];
</script>

<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		variant = 'default',
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		variant?: AlertVariant;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="alert"
	class={cn(alertVariants({ variant }), className)}
	{...restProps}
	role="alert"
>
	{@render children?.()}
</div>
