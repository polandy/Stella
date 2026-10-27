<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { IconName } from '$lib/components/ui/icons';

	/*
	 * One card of Settings that opens a page of its own: an icon, a title, a line under it and,
	 * while there is something to do there, a count.
	 */

	let {
		href,
		icon,
		title,
		blurb,
		count = 0,
		countTestId
	}: {
		href: string;
		icon: IconName;
		title: string;
		/** The line under the title; a snippet when it carries its own test id. */
		blurb: string | Snippet;
		/** Shown as a pill while above zero. */
		count?: number;
		countTestId?: string;
	} = $props();
</script>

<a
	{href}
	class="flex items-center gap-4 rounded-app bg-card p-4 shadow-card transition-colors hover:bg-card-hover"
>
	<span
		class="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"
		aria-hidden="true"><Icon name={icon} size={18} /></span
	>
	<span class="min-w-0 flex-1">
		<span class="block font-medium text-fg">{title}</span>
		{#if typeof blurb === 'string'}
			<span class="block text-sm text-fg-muted">{blurb}</span>
		{:else}
			{@render blurb()}
		{/if}
	</span>
	{#if count > 0}
		<span
			class="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary tabular-nums"
			data-testid={countTestId}
		>
			{count}
		</span>
	{/if}
	<span class="text-fg-subtle" aria-hidden="true"><Icon name="forward" size={16} /></span>
</a>
