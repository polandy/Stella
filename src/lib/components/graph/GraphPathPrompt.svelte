<script lang="ts">
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { ConnectionPath } from '$lib/graph/model/types';

	interface Props {
		/** The chain traced, once two people were picked and one was found. */
		path: ConnectionPath | null;
		/** Two people were picked and nothing links them. */
		pathMissing: boolean;
		/** The first of the pair, while the second is still to be picked. */
		pathFrom: string | null;
		nameOf: (id: string) => string;
	}
	let { path, pathMissing, pathFrom, nameOf }: Props = $props();

	const t = useTranslate();
	const pathChain = $derived(path ? path.nodeIds.map(nameOf) : []);
</script>

<div
	class="pointer-events-none absolute inset-x-0 top-16 flex justify-center"
>
	<div
		data-testid="path-prompt"
		aria-live="polite"
		class="rounded-full border border-border bg-card/90 px-4 py-1.5 text-xs text-fg-muted backdrop-blur"
	>
		{#if path}
			{pathChain.join(' → ')}
		{:else if pathMissing}
			{t('graph.path.none')}
		{:else if pathFrom}
			{t('graph.path.pickSecond')}
		{:else}
			{t('graph.path.pickTwo')}
		{/if}
	</div>
</div>
