<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const d = $derived(data.dashboard);

	type ThemeChoice = 'light' | 'dark' | 'system';
	let theme = $state<ThemeChoice>('system');

	function applyTheme(choice: ThemeChoice) {
		theme = choice;
		const root = document.documentElement;
		if (choice === 'system') {
			root.removeAttribute('data-theme');
			localStorage.removeItem('stella-theme');
		} else {
			root.setAttribute('data-theme', choice);
			localStorage.setItem('stella-theme', choice);
		}
	}

	// Relative "time ago" for panel timestamps.
	function ago(ms: number): string {
		const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
		if (s < 60) return 'just now';
		if (s < 3600) return `${Math.floor(s / 60)}m ago`;
		if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
		if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
		return `${Math.floor(s / 604800)}w ago`;
	}
</script>

<svelte:head><title>Home · Stella</title></svelte:head>

<main class="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-10">
	<header class="flex flex-wrap items-center justify-between gap-4">
		<div class="flex items-center gap-3">
			<div class="grid size-11 place-items-center rounded-app bg-primary text-xl text-primary-fg shadow">
				★
			</div>
			<div>
				<h1 class="text-2xl font-semibold text-fg">Hello, {data.user.name}</h1>
				<p class="text-sm text-fg-muted">Here’s what’s new in your household.</p>
			</div>
		</div>
		<nav class="flex items-center gap-2">
			<a href="/contacts" class="rounded-app border border-border px-4 py-2 text-sm text-fg-muted transition-colors hover:text-fg">Contacts</a>
			<a href="/circles" class="rounded-app border border-border px-4 py-2 text-sm text-fg-muted transition-colors hover:text-fg">Circles</a>
			<a href="/graph" class="rounded-app border border-border px-4 py-2 text-sm text-fg-muted transition-colors hover:text-fg">Graph</a>
			<a href="/contacts/new" class="rounded-app bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90">Add person</a>
		</nav>
	</header>

	<div class="grid gap-6 md:grid-cols-2">
		<!-- New people -->
		<section class="flex flex-col gap-3 rounded-app border border-border bg-card p-5">
			<div class="flex items-center justify-between">
				<h2 class="text-sm font-semibold uppercase tracking-wide text-fg-subtle">New people</h2>
				<a href="/contacts" class="text-xs text-link hover:underline">All contacts</a>
			</div>
			{#if d.newPeople.length}
				<ul class="flex flex-col gap-1">
					{#each d.newPeople as p (p.id)}
						<li>
							<a href="/contacts/{p.id}" class="flex items-center gap-3 rounded-app px-2 py-1.5 transition-colors hover:bg-bg-sunken">
								<Avatar id={p.id} name={p.displayName} avatarPhotoId={p.avatarPhotoId} size={32} />
								<span class="min-w-0 flex-1">
									<span class="block truncate text-fg">{p.displayName}</span>
									{#if p.description}<span class="block truncate text-xs text-fg-subtle">{p.description}</span>{/if}
								</span>
								<span class="shrink-0 text-xs text-fg-subtle">{ago(p.createdAt)}</span>
							</a>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-sm text-fg-subtle">No one yet. <a href="/contacts/new" class="text-link hover:underline">Add someone</a>.</p>
			{/if}
		</section>

		<!-- Recent notes -->
		<section class="flex flex-col gap-3 rounded-app border border-border bg-card p-5">
			<h2 class="text-sm font-semibold uppercase tracking-wide text-fg-subtle">Recent notes</h2>
			{#if d.recentNotes.length}
				<ul class="flex flex-col gap-2">
					{#each d.recentNotes as n (n.id)}
						<li>
							<a href="/contacts/{n.contactId}" class="block rounded-app px-2 py-1.5 transition-colors hover:bg-bg-sunken">
								<div class="flex items-center gap-2">
									{#if n.isPinned}<span class="text-xs text-primary">★</span>{/if}
									<span class="truncate text-sm font-medium text-fg">{n.title ?? n.contactName}</span>
									<span class="ml-auto shrink-0 text-xs text-fg-subtle">{ago(n.createdAt)}</span>
								</div>
								<p class="truncate text-xs text-fg-muted">{n.excerpt}</p>
							</a>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-sm text-fg-subtle">No notes yet.</p>
			{/if}
		</section>

		<!-- Your contributions -->
		<section class="flex flex-col gap-3 rounded-app border border-border bg-card p-5 md:col-span-2">
			<h2 class="text-sm font-semibold uppercase tracking-wide text-fg-subtle">Your contributions</h2>
			{#if d.contributions.length}
				<ul class="flex flex-col gap-1">
					{#each d.contributions as c (c.kind + c.id)}
						<li>
							<a href="/contacts/{c.contactId}" class="flex items-center gap-3 rounded-app px-2 py-1.5 transition-colors hover:bg-bg-sunken">
								<span class="shrink-0 text-xs text-fg-subtle">{c.kind === 'contact' ? '👤' : '📝'}</span>
								<span class="min-w-0 flex-1 truncate text-sm text-fg">
									{c.kind === 'contact' ? 'Added' : 'Noted'} <span class="font-medium">{c.label}</span>
								</span>
								<span class="shrink-0 text-xs text-fg-subtle">{ago(c.at)}</span>
							</a>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-sm text-fg-subtle">Things you add will show up here.</p>
			{/if}
		</section>
	</div>

	<footer class="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
		<div class="flex gap-1 rounded-app border border-border bg-card p-1">
			{#each ['light', 'system', 'dark'] as const as choice (choice)}
				<button
					onclick={() => applyTheme(choice)}
					class="rounded-md px-3 py-1.5 text-sm capitalize transition-colors"
					class:bg-primary={theme === choice}
					class:text-primary-fg={theme === choice}
					class:text-fg-muted={theme !== choice}
				>
					{choice}
				</button>
			{/each}
		</div>
		<form method="POST" action="/logout">
			<button class="rounded-app border border-border px-4 py-2 text-sm text-fg-muted transition-colors hover:text-fg">
				Sign out
			</button>
		</form>
	</footer>
</main>
