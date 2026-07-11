<script lang="ts">
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
			<div class="grid h-full place-items-center text-center">
				<div>
					<p class="text-fg-muted">No people to explore yet.</p>
					<a href="/contacts/new" class="mt-2 inline-block text-sm text-link hover:underline">
						Add your first contact
					</a>
				</div>
			</div>
		{/if}
	</div>
</div>
