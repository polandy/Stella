<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	// Primary destinations. `match` decides the active state from the pathname.
	const nav = [
		{ href: '/', label: 'Home', icon: 'home' as const, match: (p: string) => p === '/' },
		{ href: '/contacts', label: 'Contacts', icon: 'people' as const, match: (p: string) => p.startsWith('/contacts') },
		{ href: '/circles', label: 'Circles', icon: 'circles' as const, match: (p: string) => p.startsWith('/circles') },
		{ href: '/graph', label: 'Graph', icon: 'graph' as const, match: (p: string) => p.startsWith('/graph') },
		{ href: '/settings', label: 'Settings', icon: 'settings' as const, match: (p: string) => p.startsWith('/settings') }
	];
	const isActive = (item: (typeof nav)[number]) => item.match(page.url.pathname);

	// Breadcrumbs derived from the route id + merged page data (contact/circle names).
	type Crumb = { label: string; href?: string };
	const crumbs = $derived.by((): Crumb[] => {
		const id = page.route.id ?? '';
		const d = page.data as { contact?: { displayName?: string }; circle?: { name?: string } };
		const trail: Crumb[] = [{ label: 'Home', href: '/' }];
		if (id === '/(app)') return [{ label: 'Home' }];

		if (id.startsWith('/(app)/contacts')) {
			trail.push({ label: 'Contacts', href: '/contacts' });
			if (id === '/(app)/contacts/new') trail.push({ label: 'New person' });
			else if (id.startsWith('/(app)/contacts/[id]')) {
				const name = d.contact?.displayName ?? 'Contact';
				if (id.endsWith('/journal')) {
					trail.push({ label: name, href: `/contacts/${page.params.id}` });
					trail.push({ label: 'Journal' });
				} else trail.push({ label: name });
			}
		} else if (id.startsWith('/(app)/circles')) {
			trail.push({ label: 'Circles', href: '/circles' });
			if (id.startsWith('/(app)/circles/[id]')) trail.push({ label: d.circle?.name ?? 'Circle' });
		} else if (id.startsWith('/(app)/graph')) {
			trail.push({ label: 'Graph' });
		} else if (id.startsWith('/(app)/search')) {
			trail.push({ label: 'Search' });
		} else if (id.startsWith('/(app)/settings')) {
			trail.push({ label: 'Settings', href: '/settings' });
			if (id.startsWith('/(app)/settings/import')) trail.push({ label: 'Import from Monica' });
		}
		return trail;
	});

	// ⌘K / Ctrl+K jumps to the "What happened?" field from anywhere (docs/02 §2.22.1).
	function onGlobalKeydown(event: KeyboardEvent) {
		if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
		event.preventDefault();
		const field = document.querySelector<HTMLTextAreaElement>('[data-moment-body]');
		if (field) field.focus();
		else void goto('/?compose');
	}

	// Theme: same contract as the no-flash init in app.html (stella-theme).
	type ThemeChoice = 'light' | 'system' | 'dark';
	let theme = $state<ThemeChoice>('system');
	onMount(() => {
		const t = localStorage.getItem('stella-theme');
		if (t === 'light' || t === 'dark') theme = t;
	});
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

	const initials = $derived(
		data.user.name
			.split(/\s+/)
			.map((w) => w[0])
			.slice(0, 2)
			.join('')
			.toUpperCase()
	);
</script>

<svelte:window onkeydown={onGlobalKeydown} />

{#snippet navIcon(name: string)}
	{#if name === 'home'}
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12l9-9 9 9" /><path d="M5 10v10h14V10" /></svg>
	{:else if name === 'people'}
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20c.6-3.2 3-5 5.5-5s4.9 1.8 5.5 5" /><path d="M16 5.2A3.2 3.2 0 0 1 16 11M17.5 15c2 .4 3.6 2.1 4 5" /></svg>
	{:else if name === 'circles'}
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="9" r="4.5" /><circle cx="15.5" cy="14" r="4.5" /></svg>
	{:else if name === 'graph'}
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="8" r="2.5" /><circle cx="12" cy="18" r="2.5" /><path d="M7.8 7.6 10.5 16M8 6.6 15.6 7.5M16.7 10 13 16" /></svg>
	{:else if name === 'settings'}
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
	{:else if name === 'search'}
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
	{:else if name === 'plus'}
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14" /></svg>
	{/if}
{/snippet}

<div class="flex h-screen w-full overflow-hidden bg-bg text-fg">
	<!-- Sidebar (desktop) -->
	<aside class="hidden w-60 shrink-0 flex-col gap-1 border-r border-border bg-bg-elevated p-3 md:flex">
		<a href="/" class="mb-3 flex items-center gap-2.5 px-2 py-1.5">
			<span class="grid size-8 place-items-center rounded-app bg-primary text-lg text-primary-fg shadow">★</span>
			<span class="text-base font-bold tracking-tight text-fg">Stella</span>
		</a>

		{#each nav as item (item.href)}
			<a
				href={item.href}
				aria-current={isActive(item) ? 'page' : undefined}
				class="flex items-center gap-3 rounded-app px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-bg-sunken hover:text-fg aria-[current=page]:bg-primary/15 aria-[current=page]:font-semibold aria-[current=page]:text-primary [&>svg]:size-[18px]"
			>
				{@render navIcon(item.icon)}
				{item.label}
			</a>
		{/each}

		<div class="flex-1"></div>

		<!-- Account: theme + sign out -->
		<details class="group relative">
			<summary class="flex cursor-pointer list-none items-center gap-2.5 rounded-app border border-border bg-card p-2 [&::-webkit-details-marker]:hidden">
				<span class="grid size-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-fg">{initials}</span>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-sm font-medium text-fg">{data.user.name}</span>
					<span class="block truncate text-xs text-fg-subtle">{data.user.email}</span>
				</span>
			</summary>
			<div class="absolute bottom-full left-0 mb-2 w-full rounded-app border border-border bg-card p-2 shadow-lg">
				<div class="flex gap-1 rounded-app border border-border p-1">
					{#each ['light', 'system', 'dark'] as const as choice (choice)}
						<button
							onclick={() => applyTheme(choice)}
							class="flex-1 rounded-md px-2 py-1 text-xs capitalize transition-colors"
							class:bg-primary={theme === choice}
							class:text-primary-fg={theme === choice}
							class:text-fg-muted={theme !== choice}
						>
							{choice}
						</button>
					{/each}
				</div>
				<form method="POST" action="/logout" class="mt-1">
					<button class="w-full rounded-md px-3 py-2 text-left text-sm text-fg-muted transition-colors hover:bg-bg-sunken hover:text-fg">
						Sign out
					</button>
				</form>
			</div>
		</details>
	</aside>

	<!-- Main column -->
	<div class="flex min-w-0 flex-1 flex-col">
		<!-- Top bar -->
		<header class="flex items-center gap-3 border-b border-border px-4 py-2.5 md:px-6">
			<nav aria-label="Breadcrumb" class="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
				{#each crumbs as crumb, i (i)}
					{#if i > 0}<span class="text-fg-subtle/60" aria-hidden="true">/</span>{/if}
					{#if crumb.href && i < crumbs.length - 1}
						<a href={crumb.href} class="text-fg-subtle hover:text-fg">{crumb.label}</a>
					{:else}
						<span class="font-semibold text-fg" aria-current="page">{crumb.label}</span>
					{/if}
				{/each}
			</nav>

			<div class="ml-auto flex items-center gap-2">
				<a
					href="/search"
					class="flex items-center gap-2 rounded-app border border-border bg-bg-sunken px-3 py-2 text-sm text-fg-subtle transition-colors hover:border-border hover:text-fg [&>svg]:size-[15px]"
					aria-label="Search"
				>
					{@render navIcon('search')}
					<span class="hidden lg:inline">Search…</span>
				</a>
				<a
					href="/contacts/new"
					class="flex items-center gap-1.5 rounded-app bg-primary px-3 py-2 text-sm font-semibold text-primary-fg transition-opacity hover:opacity-90 [&>svg]:size-[15px]"
				>
					{@render navIcon('plus')}
					<span class="hidden sm:inline">Add person</span>
				</a>
			</div>
		</header>

		<!-- Page content -->
		<div class="flex-1 overflow-y-auto pb-16 md:pb-0">
			{@render children()}
		</div>
	</div>

	<!-- Bottom tab bar (mobile) -->
	<nav class="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-bg-elevated md:hidden">
		{#each nav.slice(0, 2) as item (item.href)}
			<a href={item.href} aria-current={isActive(item) ? 'page' : undefined} class="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] text-fg-subtle aria-[current=page]:text-primary [&>svg]:size-[21px]">
				{@render navIcon(item.icon)}
				{item.label}
			</a>
		{/each}
		<a href="/contacts/new" class="flex flex-1 flex-col items-center py-2 text-[10px] text-fg-subtle" aria-label="Add person">
			<span class="-mt-3.5 grid size-10 place-items-center rounded-app bg-primary text-primary-fg shadow [&>svg]:size-5">{@render navIcon('plus')}</span>
		</a>
		{#each nav.slice(2) as item (item.href)}
			<a href={item.href} aria-current={isActive(item) ? 'page' : undefined} class="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] text-fg-subtle aria-[current=page]:text-primary [&>svg]:size-[21px]">
				{@render navIcon(item.icon)}
				{item.label}
			</a>
		{/each}
	</nav>
</div>
