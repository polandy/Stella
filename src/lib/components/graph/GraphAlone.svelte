<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { addRelationshipPath } from '$lib/people/sections';
	import type { GraphNode } from '$lib/graph/model/types';

	/*
	 * A centre linked to nobody draws one lonely dot: the explorer route says why and offers the
	 * step that changes it. Below the centre rather than over it.
	 */
	let { centre }: { centre: GraphNode } = $props();

	const t = useTranslate();
</script>

<div
	class="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4"
	data-testid="graph-alone"
>
	<div class="pointer-events-auto w-full max-w-sm rounded-app bg-card shadow-pop">
		{#if centre.kind === 'circle'}
			<EmptyState
				icon="circles"
				title={t('graph.aloneCircle.title', { name: centre.label })}
				hint={t('graph.aloneCircle.hint')}
			>
				<Button variant="primary" icon="add" href="/circles/{centre.id}"
					>{t('circles.addPeople')}</Button
				>
			</EmptyState>
		{:else}
			<EmptyState
				icon="graph"
				title={t('graph.alone.title', { name: centre.label })}
				hint={t('graph.alone.hint')}
			>
				<Button variant="primary" icon="add" href={addRelationshipPath(centre.id)}
					>{t('graph.alone.add')}</Button
				>
			</EmptyState>
		{/if}
	</div>
</div>
