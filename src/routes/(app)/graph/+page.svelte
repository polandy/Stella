<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import GraphExplorer from '$lib/components/graph/GraphExplorer.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Graph · Stella</title>
</svelte:head>

<div class="flex h-full flex-col">
	<p class="hidden border-b border-border px-6 py-3 text-sm text-fg-subtle sm:block">
		Click to focus · click again to expand · trace a connection path
	</p>

	<div class="relative flex-1">
		{#if data.centerId}
			{#key data.centerId}
				<GraphExplorer graph={data.graph} centerId={data.centerId} />
			{/key}
		{:else}
			<div class="grid h-full place-items-center p-6">
				<div class="w-full max-w-sm">
					<EmptyState icon="graph" title="Nothing to explore yet" hint="The map draws itself from people and how they are connected. Add someone to begin.">
						<Button variant="primary" icon="add" href="/contacts/new">Add person</Button>
					</EmptyState>
				</div>
			</div>
		{/if}
	</div>
</div>
