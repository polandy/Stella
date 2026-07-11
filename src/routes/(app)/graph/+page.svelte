<script lang="ts">
	import GraphExplorer from '$lib/components/graph/GraphExplorer.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Graph · Stella</title>
</svelte:head>

<div class="flex h-screen flex-col">
	<header class="flex items-center justify-between border-b border-border px-6 py-3">
		<div class="flex items-center gap-3">
			<a href="/contacts" class="text-sm text-fg-muted hover:text-fg">← Contacts</a>
			<h1 class="text-lg font-semibold text-fg">Explorer</h1>
		</div>
		<p class="hidden text-sm text-fg-subtle sm:block">
			Click to focus · click again to expand · trace a connection path
		</p>
	</header>

	<div class="relative flex-1">
		{#if data.centerId}
			{#key data.centerId}
				<GraphExplorer model={data.model} centerId={data.centerId} contacts={data.contacts} />
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
