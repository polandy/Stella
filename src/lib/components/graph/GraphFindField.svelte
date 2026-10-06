<script lang="ts">
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { matchPeople, peopleOf } from '$lib/graph/model/people-search';
	import type { GraphModel } from '$lib/graph/model/types';

	interface Props {
		/** The snapshot the explorer holds; suggestions come from it, not from the server. */
		graph: GraphModel;
		/** Bring a suggested person onto the map and select them. */
		onReveal: (id: string) => void;
	}
	let { graph, onReveal }: Props = $props();

	const t = useTranslate();
	let query = $state('');
	const contacts = $derived(peopleOf(graph));
	const suggestions = $derived(matchPeople(contacts, query));
</script>

<!-- On a phone the field takes whatever Filter and Arrange leave, so the three share a
     row (docs/05 §5.8). -->
<div class="pointer-events-auto relative z-20 min-w-0 flex-1 sm:flex-none">
	<input
		bind:value={query}
		placeholder={t('graph.findPlaceholder')}
		aria-label={t('graph.find')}
		class="w-full rounded-app border border-border-input bg-card/90 px-3 py-2 text-sm text-fg backdrop-blur sm:w-56"
	/>
	{#if suggestions.length}
		<ul
			data-testid="graph-suggestions"
			class="absolute top-full left-0 mt-1 w-full overflow-hidden rounded-app border border-border bg-card shadow-pop"
		>
			{#each suggestions as c (c.id)}
				<li>
					<button
						onclick={() => {
							query = '';
							onReveal(c.id);
						}}
						class="block w-full px-3 py-2 text-left text-sm text-fg hover:bg-bg-sunken"
					>
						{c.displayName}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
