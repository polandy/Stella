<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
	<header>
		<h1 class="text-2xl font-semibold text-fg">Settings</h1>
		<p class="text-fg-muted">Account and appearance settings are on their way; the data tools live here already.</p>
	</header>

	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-medium text-fg-muted">Data</h2>
		{#if data.isAdmin}
			<a href="/settings/import" class="flex items-center gap-4 rounded-app border border-border bg-card p-4 transition-colors hover:bg-bg-sunken">
				<span class="text-2xl" aria-hidden="true">📦</span>
				<span class="min-w-0 flex-1">
					<span class="block font-medium text-fg">Import from Monica</span>
					<span class="block text-sm text-fg-muted">Bring your people, relationships, notes and photos over from a Monica database dump.</span>
				</span>
				<span class="text-fg-subtle" aria-hidden="true">→</span>
			</a>
		{:else}
			<p class="text-sm text-fg-subtle">Importing and backups are for the household admin.</p>
		{/if}
	</section>
</main>
