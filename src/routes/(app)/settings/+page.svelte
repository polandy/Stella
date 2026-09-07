<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
	<header>
		<h1 class="text-2xl font-semibold text-fg">Settings</h1>
		<p class="text-fg-muted">Account and appearance settings are on their way; the data tools and the relationship vocabulary live here already.</p>
	</header>

	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-medium text-fg-muted">Data</h2>
		{#if data.isAdmin}
			<a href="/settings/import" class="flex items-center gap-4 rounded-app bg-card p-4 shadow-card transition-colors hover:bg-card-hover">
				<span class="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary" aria-hidden="true"><Icon name="import" size={18} /></span>
				<span class="min-w-0 flex-1">
					<span class="block font-medium text-fg">Import from Monica</span>
					<span class="block text-sm text-fg-muted">Bring your people, relationships, notes and photos over from a Monica database dump.</span>
				</span>
				<span class="text-fg-subtle" aria-hidden="true"><Icon name="forward" size={16} /></span>
			</a>
			<form method="POST" action="/settings/export" class="contents">
				<button type="submit" class="flex w-full items-center gap-4 rounded-app bg-card p-4 text-left shadow-card transition-colors hover:bg-card-hover">
					<span class="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary" aria-hidden="true"><Icon name="export" size={18} /></span>
					<span class="min-w-0 flex-1">
						<span class="block font-medium text-fg">Download the archive</span>
						<span class="block text-sm text-fg-muted">Everything the household has, as one readable text file with the photos beside it — yours to keep, and to read with anything.</span>
					</span>
					<span class="text-fg-subtle" aria-hidden="true"><Icon name="forward" size={16} /></span>
				</button>
			</form>
			<a href="/settings/import/archive" class="flex items-center gap-4 rounded-app bg-card p-4 shadow-card transition-colors hover:bg-card-hover">
				<span class="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary" aria-hidden="true"><Icon name="archive" size={18} /></span>
				<span class="min-w-0 flex-1">
					<span class="block font-medium text-fg">Restore from an archive</span>
					<span class="block text-sm text-fg-muted">Read a Stella archive back in. Anything this household already has is left as it is.</span>
				</span>
				<span class="text-fg-subtle" aria-hidden="true"><Icon name="forward" size={16} /></span>
			</a>
			<a href="/settings/relationship-types" class="flex items-center gap-4 rounded-app bg-card p-4 shadow-card transition-colors hover:bg-card-hover">
				<span class="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary" aria-hidden="true"><Icon name="people" size={18} /></span>
				<span class="min-w-0 flex-1">
					<span class="block font-medium text-fg">Relationship types</span>
					<span class="block text-sm text-fg-muted">Name the kinds of link your household records, beyond the ones Stella ships with.</span>
				</span>
				<span class="text-fg-subtle" aria-hidden="true"><Icon name="forward" size={16} /></span>
			</a>
		{:else}
			<p class="text-sm text-fg-subtle">Importing, backups and the relationship types are for the household admin.</p>
		{/if}
	</section>
</main>
