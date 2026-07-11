<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const c = $derived(data.contact);
</script>

<main class="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-10">
	<a href="/contacts" class="text-sm text-fg-muted hover:text-fg">← Contacts</a>

	<header class="flex items-center gap-4">
		<span
			class="grid size-16 shrink-0 place-items-center rounded-full bg-bg-sunken text-2xl font-medium text-fg-muted"
		>
			{c.displayName.slice(0, 1).toUpperCase()}
		</span>
		<div class="min-w-0">
			<h1 class="truncate text-2xl font-semibold text-fg">{c.displayName}</h1>
			{#if c.description}
				<p class="truncate text-fg-muted">{c.description}</p>
			{/if}
			{#if c.visibility === 'private'}
				<span class="text-xs text-fg-subtle">Private — only you can see this contact</span>
			{/if}
		</div>
	</header>

	<section class="rounded-app border border-border bg-card p-6">
		<h2 class="mb-3 text-sm font-medium text-fg-muted">How you met</h2>
		{#if c.howWeMet || c.metPlace || c.metDate}
			<p class="text-fg">
				{c.howWeMet ?? ''}{#if c.metPlace}
					<span class="text-fg-muted"> · {c.metPlace}</span>{/if}{#if c.metDate}
					<span class="text-fg-muted"> · {c.metDate}</span>{/if}
			</p>
		{:else}
			<p class="text-fg-subtle">Not recorded yet.</p>
		{/if}
	</section>

	<section class="rounded-app border border-dashed border-border p-6 text-center text-sm text-fg-subtle">
		Relationships, notes, photos, and the explorer arrive next in M1.
	</section>
</main>
