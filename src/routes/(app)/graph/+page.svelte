<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
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
	<p class="hidden border-b border-border px-6 py-3 text-sm text-fg-subtle sm:block">
		{t('graph.hint')}
	</p>

	<div class="relative flex-1">
		{#if data.centerId}
			{#key data.centerId}
				<GraphExplorer graph={data.graph} centerId={data.centerId} />
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
