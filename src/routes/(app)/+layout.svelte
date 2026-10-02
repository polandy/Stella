<script lang="ts">
	import { afterNavigate, beforeNavigate, goto, invalidate, invalidateAll, onNavigate, pushState } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import Button from '$lib/components/Button.svelte';
	import ActivityIndicator from '$lib/components/ActivityIndicator.svelte';
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { IconName } from '$lib/components/icons';
	import type { MessageKey } from '$lib/i18n/translate';
	import Logo from '$lib/components/Logo.svelte';
	import OfflineBanner from '$lib/components/OfflineBanner.svelte';
	import SignOutForm from '$lib/components/SignOutForm.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { provideRemovals } from '$lib/undo/context.svelte';
	import { navigationTurns } from '$lib/undo/navigation-turns';
	import { providePending } from '$lib/sync/context.svelte';
	import { providePeopleContext } from '$lib/people/context.svelte';
	import { refreshPeopleIfChanged, shellReloads } from '$lib/sync/people-freshness';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { reachability } from '$lib/pwa/reachability.svelte';
	import { reportNavigation } from '$lib/sync/pending';
	import { followScroll, SHOWN_TOP_BAR } from '$lib/shell/top-bar';
	import { onMount, untrack, type Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const t = useTranslate();

	// Primary destinations. `match` decides the active state from the pathname; the label is
	// a message key so the sidebar follows the viewer's language.
	const nav: { href: string; label: MessageKey; icon: IconName; match: (p: string) => boolean }[] = [
		{ href: '/', label: 'nav.home', icon: 'home', match: (p) => p === '/' },
		{ href: '/contacts', label: 'nav.people', icon: 'people', match: (p) => p.startsWith('/contacts') },
		{ href: '/circles', label: 'nav.circles', icon: 'circles', match: (p) => p.startsWith('/circles') },
		{ href: '/graph', label: 'nav.graph', icon: 'graph', match: (p) => p.startsWith('/graph') },
		{ href: '/settings', label: 'nav.settings', icon: 'settings', match: (p) => p.startsWith('/settings') }
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
		const trail: Crumb[] = [{ label: t('nav.home'), href: '/' }];
		if (id === '/(app)') return [{ label: t('nav.home') }];

		if (id.startsWith('/(app)/contacts')) {
			trail.push({ label: t('nav.people'), href: '/contacts' });
			if (id === '/(app)/contacts/new') trail.push({ label: t('nav.newPerson') });
			else if (id.startsWith('/(app)/contacts/[id]')) {
				const name = d.contact?.displayName ?? t('nav.contact');
				if (id.endsWith('/journal')) {
					trail.push({ label: name, href: `/contacts/${page.params.id}` });
					trail.push({ label: t('nav.journal') });
				} else trail.push({ label: name });
			}
		} else if (id.startsWith('/(app)/circles')) {
			trail.push({ label: t('nav.circles'), href: '/circles' });
			if (id.startsWith('/(app)/circles/[id]'))
				trail.push({ label: d.circle?.name ?? t('nav.circle') });
		} else if (id.startsWith('/(app)/graph')) {
			trail.push({ label: t('nav.graph') });
		} else if (id.startsWith('/(app)/search')) {
			trail.push({ label: t('nav.search') });
		} else if (id.startsWith('/(app)/settings')) {
			trail.push({ label: t('nav.settings'), href: '/settings' });
			if (id.startsWith('/(app)/settings/import')) trail.push({ label: t('nav.importPeople') });
		}
		return trail;
	});

	// ⌘K / Ctrl+K opens the palette from anywhere (docs/05 §5.4); its first row is the
	// capture field, so the old "jump to What happened?" is still two keystrokes away.
	let paletteOpen = $state(false);
	// The palette is the one control here that does nothing at all without JavaScript, and the
	// shortcut only listens once this layout has mounted. Until then the trigger says so by
	// being disabled, rather than swallowing a click in the first moments after a load.
	let paletteReady = $state(false);
	onMount(() => (paletteReady = true));

	// A phone's top bar slides away while the page scrolls down and back as it scrolls up
	// (docs/05 §5.4); `followScroll` decides, this only feeds it and slides the bar.
	let topBar = $state(SHOWN_TOP_BAR);
	let topBarHeight = $state(0);
	let scroller: HTMLDivElement | undefined = $state();
	// Every page opens with its bar, from wherever the shared scroller stands.
	afterNavigate(() => (topBar = { ...SHOWN_TOP_BAR, y: scroller?.scrollTop ?? 0 }));
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

	/*
	 * Everything the app is waiting for, in one place (docs/05 §5.7): a page still loading, and
	 * any change a page reported — a relationship save reloads the person's graph, and on a
	 * large household that takes long enough to read as nothing having happened.
	 */
	const pending = providePending();
	// A navigation is work like any other, and reported the same way, so a short one stays
	// under the store's own delay instead of flashing the indicator for a frame. The rule
	// itself is in `$lib/sync/pending`, where a unit test can drive it.
	$effect(() => reportNavigation(pending, navigating.to));

	// Removals are held back for an undo window (docs/04 §4.9). Leaving the page ends the
	// window: a client-side navigation waits for the requests so the next screen cannot read
	// the item back; an unload — or a native form post, which must not be replayed as a GET —
	// sends them with keepalive alongside and hopes for the best.
	const removals = provideRemovals();
	providePeopleContext(() => data.peopleContext);
	/*
	 * The people every picker reads come with the shell, which a client-side navigation keeps,
	 * and so does a tab left open while someone else adds a person. After a navigation, and
	 * whenever the tab comes back into view, they are reloaded if anyone changed them
	 * (docs/04 §4.9).
	 */
	const refreshPeople = () =>
		void refreshPeopleIfChanged(
			{
				fetchStamp: async () => {
					const answer = await fetch('/api/people/stamp');
					if (!answer.ok) throw new Error(`people stamp: ${answer.status}`);
					return ((await answer.json()) as { stamp: string }).stamp;
				},
				reload: () => invalidate('app:people')
			},
			data.peopleStamp
		);
	// A navigation that reloaded the shell (a form submit, an invalidation) is fresh already.
	const shell = shellReloads(untrack(() => data.people));
	afterNavigate((navigation) => {
		if (shell.reloadedSinceLastLook(data.people)) return;
		if (navigation.type !== 'enter') refreshPeople();
	});
	const turns = navigationTurns();
	beforeNavigate((navigation) => {
		// Taken for every navigation, so a newer one retires any held back below.
		const stillLatest = turns.take();
		if (removals.snapshot.removals.length === 0) return;
		if (navigation.type === 'leave' || navigation.type === 'form' || !navigation.to) {
			void removals.flush();
			return;
		}
		const { to, type, delta } = navigation;
		navigation.cancel();
		void removals.flush().then(() => {
			if (!stillLatest()) return;
			if (type === 'popstate' && delta) history.go(delta);
			else void goto(to.url);
		});
	});
	onMount(() => {
		const flush = () => void removals.flush();
		window.addEventListener('pagehide', flush);
		return () => window.removeEventListener('pagehide', flush);
	});

	/*
	 * What this member saved while Stella was out of reach (docs/concepts/offline-capture.md
	 * §4) is sent when the app opens, when Stella answers again, when the tab comes back into
	 * view and when the device joins a network — never on a timer. What Stella took is read back by reloading the page's data.
	 */
	onMount(() => {
		void outbox.start(data.user.id, () => void invalidateAll()).catch(() => {
			// No IndexedDB (a private window in some browsers): nothing can have been kept.
		});
		const onVisible = () => {
			if (document.visibilityState !== 'visible') return;
			void outbox.refresh().then(() => outbox.send());
			refreshPeople();
		};
		// A hint, not proof: it fires when the phone joins a network — the home Wi-Fi, say.
		const onOnline = () => void outbox.send();
		document.addEventListener('visibilitychange', onVisible);
		window.addEventListener('online', onOnline);
		return () => {
			document.removeEventListener('visibilitychange', onVisible);
			window.removeEventListener('online', onOnline);
		};
	});
	$effect(() => {
		if (reachability.reachable) void outbox.send();
	});

	// On Home the pencil opens the sheet as shallow state, which needs no round trip and so
	// works while Stella is out of reach; from anywhere else it is a plain link to Home.
	function openComposer(event: MouseEvent) {
		if (page.url.pathname !== '/') return;
		event.preventDefault();
		pushState('/?compose', { compose: true });
	}

	// The phone's tabs. The current one is not told by its colour alone (WCAG 1.4.1): it is
	// also set in semibold, under a bar along the tab bar's top edge.
	const TAB =
		'relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-fg-subtle aria-[current=page]:font-semibold aria-[current=page]:text-primary';
	const TAB_MARK = 'absolute inset-x-1/4 top-0 h-0.5 rounded-b-full bg-primary';

	let accountMenu: HTMLDetailsElement | undefined = $state();
	function closeAccountMenuOnEscape(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !accountMenu?.open) return;
		event.preventDefault();
		accountMenu.open = false;
		accountMenu.querySelector('summary')?.focus();
	}

	// Theme: same contract as the no-flash init in app.html (stella-theme).
	type ThemeChoice = 'light' | 'system' | 'dark';
	const THEME_CHOICES: { value: ThemeChoice; label: MessageKey }[] = [
		{ value: 'light', label: 'nav.theme.light' },
		{ value: 'system', label: 'nav.theme.system' },
		{ value: 'dark', label: 'nav.theme.dark' }
	];
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

<!--
	One indicator for the whole app (docs/05 §5.7): a page still loading, and any change a page
	reported through the pending-work store — a relationship save and the graph reload behind
	it. It is fixed to the top of the window, so it never moves the page it reports on.
-->
<ActivityIndicator busy={pending.busy} label={t('common.updating')} />
<CommandPalette people={data.people} bind:open={paletteOpen} />
<Toast />

<!-- The visible height, not 100vh: a phone browser counts 100vh with its address bar hidden,
     so a shell that tall runs its foot under the fixed tab bar while the bar is showing. -->
<!-- The first stop for a keyboard: past the sidebar and the top bar to the page itself. -->
<a
	href="#content"
	class="sr-only z-50 rounded-control bg-card text-sm font-medium text-fg shadow-pop focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:px-3 focus:py-2"
>
	{t('nav.skipToContent')}
</a>

<div class="flex h-dvh w-full overflow-hidden bg-bg text-fg">
	<!-- Sidebar (desktop) -->
	<aside class="hidden w-60 shrink-0 flex-col gap-1 bg-bg-sunken p-3 md:flex">
		<a href="/" class="mb-3 flex items-center px-2 py-1.5" aria-label={t('nav.stellaHome')}>
			<Logo size={26} wordmark />
		</a>

		<nav aria-label={t('nav.main')} class="flex flex-col gap-1">
			{#each nav as item (item.href)}
				<a
					href={item.href}
					aria-current={isActive(item) ? 'page' : undefined}
					class="flex items-center gap-3 rounded-control px-3 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-card hover:text-fg aria-[current=page]:bg-card aria-[current=page]:font-semibold aria-[current=page]:text-fg aria-[current=page]:shadow-card [&_svg]:text-fg-subtle aria-[current=page]:[&_svg]:text-primary"
				>
					<Icon name={item.icon} size={17} />
					{t(item.label)}
				</a>
			{/each}
		</nav>

		<div class="flex-1"></div>

		<!-- Account: theme + sign out -->
		<!-- Escape closes it like any other menu, and hands focus back to its summary. -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<details class="group relative" bind:this={accountMenu} onkeydown={closeAccountMenuOnEscape}>
			<summary class="flex cursor-pointer list-none items-center gap-2.5 rounded-app bg-card p-2 shadow-card [&::-webkit-details-marker]:hidden">
				<span class="sr-only">{t('nav.accountMenu')}</span>
				<span class="grid size-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-fg">{initials}</span>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-sm font-medium text-fg">{data.user.name}</span>
					<span class="block truncate text-xs text-fg-subtle">{data.user.email}</span>
				</span>
			</summary>
			<div class="absolute bottom-full left-0 mb-2 w-full rounded-app border border-border bg-card p-2 shadow-pop">
				<div class="flex gap-1 rounded-control border border-border p-1">
					{#each THEME_CHOICES as choice (choice.value)}
						<button
							onclick={() => applyTheme(choice.value)}
							aria-pressed={theme === choice.value}
							class="flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors"
							class:bg-primary={theme === choice.value}
							class:text-primary-fg={theme === choice.value}
							class:text-fg-muted={theme !== choice.value}
						>
							{t(choice.label)}
						</button>
					{/each}
				</div>
				<SignOutForm class="mt-1">
					<button class="w-full rounded-md px-3 py-2 text-left text-sm text-fg-muted transition-colors hover:bg-card-hover hover:text-fg">
						{t('nav.signOut')}
					</button>
				</SignOutForm>
			</div>
		</details>
	</aside>

	<!-- Main column -->
	<div class="flex min-w-0 flex-1 flex-col">
		<!-- Top bar -->
		<!-- Slid up out of the shell rather than taken out of the flow, so the page follows it
		     smoothly; a keyboard reaching into it brings it back. -->
		<header
			bind:offsetHeight={topBarHeight}
			onfocusin={() => (topBar = { ...topBar, hidden: false })}
			style:--top-bar-height="{topBarHeight}px"
			class="flex items-center gap-3 px-4 py-3 transition-[margin-top] duration-350 ease-in-out motion-reduce:transition-none md:px-6 {topBar.hidden
				? 'max-md:-mt-(--top-bar-height)'
				: ''}"
			data-testid="top-bar"
			data-hidden={topBar.hidden}
		>
			<!-- On Home the trail would be "Home" alone, which the tab bar and sidebar already say;
			     a phone, which has no sidebar, shows the logo there instead. -->
			{#if crumbs.length <= 1}
				<a href="/" class="flex items-center md:hidden" aria-label={t('nav.stellaHome')}><Logo size={26} wordmark /></a>
			{:else}
				<nav aria-label={t('nav.breadcrumb')} class="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
					{#each crumbs as crumb, i (i)}
						{#if i > 0}<span class="text-fg-subtle/60" aria-hidden="true">/</span>{/if}
						{#if crumb.href && i < crumbs.length - 1}
							<a href={crumb.href} class="text-fg-muted hover:text-fg">{crumb.label}</a>
						{:else}
							<span class="font-semibold text-fg" aria-current="page">{crumb.label}</span>
						{/if}
					{/each}
				</nav>
			{/if}

			<div class="ml-auto flex items-center gap-2">
				<button
					type="button"
					onclick={() => (paletteOpen = true)}
					disabled={!paletteReady}
					class="flex items-center gap-2 rounded-control bg-card px-3 py-2 text-sm text-fg-subtle shadow-card transition-colors hover:text-fg"
					aria-label={t('nav.search')}
					aria-keyshortcuts="Meta+K Control+K"
				>
					<Icon name="search" size={15} />
					<!-- The same words as the button's name, so a voice command can say what it reads
					     (WCAG 2.5.3); the name stays for widths where the words are hidden. -->
					<span class="hidden lg:inline">{t('nav.search')}</span>
					<kbd class="hidden rounded border border-border px-1 text-[10px] font-medium lg:inline">⌘K</kbd>
				</button>
				<Button variant="primary" icon="add" href="/contacts/new" label={t('nav.addPerson')}>
					<span class="hidden sm:inline">{t('nav.addPerson')}</span>
				</Button>
				<!-- Wrapped: the button's own display rule would outrank a utility on the element. -->
				<span class="md:hidden"><Button variant="ghost" icon="settings" href="/settings" label={t('nav.settings')} /></span>
			</div>
		</header>

		<!-- Sits above the content rather than over the shell: it is what you are reading that
		     may be out of date, not the navigation around it. -->
		<OfflineBanner />

		<!-- Page content -->
		<div
			id="content"
			tabindex="-1"
			bind:this={scroller}
			onscroll={({ currentTarget: page }) =>
				(topBar = followScroll(topBar, page.scrollTop, topBarHeight, page.scrollHeight - page.clientHeight))}
			class="flex-1 overflow-y-auto pb-16 md:pb-0"
		>
			{@render children()}
		</div>
	</div>

	<!-- Bottom tab bar (mobile) -->
	<nav aria-label={t('nav.main')} class="fixed inset-x-0 bottom-0 z-20 flex border-t border-border-subtle bg-card md:hidden">
		{#each tabBar.slice(0, 2) as item (item.href)}
			<a href={item.href} aria-current={isActive(item) ? 'page' : undefined} class={TAB}>
				{#if isActive(item)}<span class={TAB_MARK} aria-hidden="true"></span>{/if}
				<Icon name={item.icon} size={20} />
				{t(item.label)}
			</a>
		{/each}
		<a href="/?compose" onclick={openComposer} class="flex flex-1 flex-col items-center py-2.5" aria-label={t('nav.writeMoment')}>
			<span class="-mt-4 grid size-11 place-items-center rounded-full bg-primary text-primary-fg shadow-pop">
				<Icon name="write" size={21} />
			</span>
		</a>
		{#each tabBar.slice(2) as item (item.href)}
			<a href={item.href} aria-current={isActive(item) ? 'page' : undefined} class={TAB}>
				{#if isActive(item)}<span class={TAB_MARK} aria-hidden="true"></span>{/if}
				<Icon name={item.icon} size={20} />
				{t(item.label)}
			</a>
		{/each}
	</nav>
</div>
