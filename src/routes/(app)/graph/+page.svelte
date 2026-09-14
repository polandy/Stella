<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import GraphExplorer from '$lib/components/graph/GraphExplorer.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const t = useTranslate();
</script>

<svelte:head>
	<title>{t('graph.title')}</title>
</svelte:head>

<div class="flex h-full flex-col">
	<div class="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-6 py-3 text-sm">
		{#if data.cameFrom && data.centerId}
			<!-- Back to the page this centre was opened from (docs/05 §5.5). -->
			<a
				href="/contacts/{data.centerId}"
				class="inline-flex items-center gap-1 font-medium text-link hover:underline"
			>
				<Icon name="back" size={14} />{t('graph.backToPerson', { name: data.cameFrom })}
			</a>
		{/if}
		<p class="hidden text-fg-subtle sm:block">{t('graph.hint')}</p>
	</div>

	<div class="relative flex-1">
		{#if data.centerId}
			<!-- Both ends decide what is drawn, so a link that only changes the far end still
			     rebuilds the canvas. -->
			{#key `${data.centerId}:${data.pathTo}`}
				<GraphExplorer graph={data.graph} centerId={data.centerId} tracePathTo={data.pathTo} />
			{/key}
		{:else}
			<div class="grid h-full place-items-center p-6">
				<div class="w-full max-w-sm">
					<EmptyState icon="graph" title={t('graph.empty.title')} hint={t('graph.empty.hint')}>
						<Button variant="primary" icon="add" href="/contacts/new">{t('nav.addPerson')}</Button>
					</EmptyState>
				</div>
			</div>
		{/if}
	</div>
</div>
