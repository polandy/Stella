<script lang="ts">
	import { beforeNavigate, goto, onNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import Button from '$lib/components/Button.svelte';
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import type { IconName } from '$lib/components/icons';
	import Logo from '$lib/components/Logo.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { provideRemovals } from '$lib/undo/context.svelte';
	import { onMount, type Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	// Primary destinations. `match` decides the active state from the pathname.
	const nav: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
		{ href: '/', label: 'Home', icon: 'home', match: (p) => p === '/' },
		{ href: '/contacts', label: 'People', icon: 'people', match: (p) => p.startsWith('/contacts') },
		{ href: '/circles', label: 'Circles', icon: 'circles', match: (p) => p.startsWith('/circles') },
		{ href: '/graph', label: 'Graph', icon: 'graph', match: (p) => p.startsWith('/graph') },
		{ href: '/settings', label: 'Settings', icon: 'settings', match: (p) => p.startsWith('/settings') }
	];
	const isActive = (item: (typeof nav)[number]) => item.match(page.url.pathname);
	// The phone's tab bar has five places and the pencil takes the middle one; Settings is
	// rarely opened and moves to the top bar there.
	const tabBar = nav.filter((item) => item.href !== '/settings');

	// Breadcrumbs derived from the route id + merged page data (contact/circle names).
	type Crumb = { label: string; href?: string };
	const crumbs = $derived.by((): Crumb[] => {
		const id = page.route.id ?? '';
		const d = page.data as { contact?: { displayName?: string }; circle?: { name?: string } };
		const trail: Crumb[] = [{ label: 'Home', href: '/' }];
		if (id === '/(app)') return [{ label: 'Home' }];

		if (id.startsWith('/(app)/contacts')) {
			trail.push({ label: 'People', href: '/contacts' });
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

	// ⌘K / Ctrl+K opens the palette from anywhere (docs/05 §5.4); its first row is the
	// capture field, so the old "jump to What happened?" is still two keystrokes away.
	let paletteOpen = $state(false);
	function onGlobalKeydown(event: KeyboardEvent) {
		if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
		event.preventDefault();
		paletteOpen = !paletteOpen;
	}

	// A cross-fade between screens (docs/05 §5.5), so a list and the person it opens read as
	// one place. Browsers without the API and people who asked for less motion get a cut.
	onNavigate((navigation) => {
		if (!document.startViewTransition) return;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});

	// Removals are held back for an undo window (docs/04 §4.9). Leaving the page ends the
	// window: a client-side navigation waits for the requests so the next screen cannot read
	// the item back; an unload — or a native form post, which must not be replayed as a GET —
	// sends them with keepalive alongside and hopes for the best.
	const removals = provideRemovals();
	beforeNavigate((navigation) => {
		if (removals.snapshot.removals.length === 0) return;
		if (navigation.type === 'leave' || navigation.type === 'form' || !navigation.to) {
			void removals.flush();
			return;
		}
		const { to, type, delta } = navigation;
		navigation.cancel();
		void removals.flush().then(() => {
			if (type === 'popstate' && delta) history.go(delta);
			else void goto(to.url);
		});
	});
	onMount(() => {
		const flush = () => void removals.flush();
		window.addEventListener('pagehide', flush);
		return () => window.removeEventListener('pagehide', flush);
	});

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

<CommandPalette people={data.people} bind:open={paletteOpen} />
<Toast />

<div class="flex h-screen w-full overflow-hidden bg-bg text-fg">
	<!-- Sidebar (desktop) -->
	<aside class="hidden w-60 shrink-0 flex-col gap-1 bg-bg-sunken p-3 md:flex">
		<a href="/" class="mb-3 flex items-center px-2 py-1.5" aria-label="Stella home">
			<Logo size={26} wordmark />
		</a>

		{#each nav as item (item.href)}
			<a
				href={item.href}
				aria-current={isActive(item) ? 'page' : undefined}
				class="flex items-center gap-3 rounded-control px-3 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-card hover:text-fg aria-[current=page]:bg-card aria-[current=page]:font-semibold aria-[current=page]:text-fg aria-[current=page]:shadow-card [&_svg]:text-fg-subtle aria-[current=page]:[&_svg]:text-primary"
			>
				<Icon name={item.icon} size={17} />
				{item.label}
			</a>
		{/each}

		<div class="flex-1"></div>

		<!-- Account: theme + sign out -->
		<details class="group relative">
			<summary class="flex cursor-pointer list-none items-center gap-2.5 rounded-app bg-card p-2 shadow-card [&::-webkit-details-marker]:hidden">
				<span class="grid size-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-fg">{initials}</span>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-sm font-medium text-fg">{data.user.name}</span>
					<span class="block truncate text-xs text-fg-subtle">{data.user.email}</span>
				</span>
			</summary>
			<div class="absolute bottom-full left-0 mb-2 w-full rounded-app border border-border bg-card p-2 shadow-pop">
				<div class="flex gap-1 rounded-control border border-border p-1">
					{#each ['light', 'system', 'dark'] as const as choice (choice)}
						<button
							onclick={() => applyTheme(choice)}
							class="flex-1 rounded-md px-2 py-1 text-xs font-medium capitalize transition-colors"
							class:bg-primary={theme === choice}
							class:text-primary-fg={theme === choice}
							class:text-fg-muted={theme !== choice}
						>
							{choice}
						</button>
					{/each}
				</div>
				<form method="POST" action="/logout" class="mt-1">
					<button class="w-full rounded-md px-3 py-2 text-left text-sm text-fg-muted transition-colors hover:bg-card-hover hover:text-fg">
						Sign out
					</button>
				</form>
			</div>
		</details>
	</aside>

	<!-- Main column -->
	<div class="flex min-w-0 flex-1 flex-col">
		<!-- Top bar -->
		<header class="flex items-center gap-3 px-4 py-3 md:px-6">
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
				<button
					type="button"
					onclick={() => (paletteOpen = true)}
					class="flex items-center gap-2 rounded-control bg-card px-3 py-2 text-sm text-fg-subtle shadow-card transition-colors hover:text-fg"
					aria-label="Search"
					aria-keyshortcuts="Meta+K Control+K"
				>
					<Icon name="search" size={15} />
					<span class="hidden lg:inline">Search…</span>
					<kbd class="hidden rounded border border-border px-1 text-[10px] font-medium lg:inline">⌘K</kbd>
				</button>
				<Button variant="primary" icon="add" href="/contacts/new" label="Add person">
					<span class="hidden sm:inline">Add person</span>
				</Button>
				<!-- Wrapped: the button's own display rule would outrank a utility on the element. -->
				<span class="md:hidden"><Button variant="ghost" icon="settings" href="/settings" label="Settings" /></span>
			</div>
		</header>

		<!-- Page content -->
		<div class="flex-1 overflow-y-auto pb-16 md:pb-0">
			{@render children()}
		</div>
	</div>

	<!-- Bottom tab bar (mobile) -->
	<nav class="fixed inset-x-0 bottom-0 z-20 flex border-t border-border-subtle bg-card md:hidden">
		{#each tabBar.slice(0, 2) as item (item.href)}
			<a href={item.href} aria-current={isActive(item) ? 'page' : undefined} class="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-fg-subtle aria-[current=page]:text-primary">
				<Icon name={item.icon} size={20} />
				{item.label}
			</a>
		{/each}
		<a href="/?compose" class="flex flex-1 flex-col items-center py-2.5" aria-label="Write a moment">
			<span class="-mt-4 grid size-11 place-items-center rounded-full bg-primary text-primary-fg shadow-pop">
				<Icon name="write" size={21} />
			</span>
		</a>
		{#each tabBar.slice(2) as item (item.href)}
			<a href={item.href} aria-current={isActive(item) ? 'page' : undefined} class="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-fg-subtle aria-[current=page]:text-primary">
				<Icon name={item.icon} size={20} />
				{item.label}
			</a>
		{/each}
	</nav>
</div>
