<script lang="ts">
	import { afterNavigate, onNavigate, pushState } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import Button from '$lib/components/ui/Button.svelte';
	import ActivityIndicator from '$lib/components/ui/ActivityIndicator.svelte';
	import CommandPalette from '$lib/components/shell/CommandPalette.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { IconName } from '$lib/components/ui/icons';
	import type { MessageKey } from '$lib/i18n/translate';
	import Logo from '$lib/components/shell/Logo.svelte';
	import OfflineBanner from '$lib/components/pwa/OfflineBanner.svelte';
	import VeilLock from '$lib/components/shell/VeilLock.svelte';
	import AccountMenu from '$lib/components/shell/AccountMenu.svelte';
	import Toast from '$lib/components/ui/Toast.svelte';
	import { provideRemovals } from '$lib/undo/context.svelte';
	import { providePending } from '$lib/sync/context.svelte';
	import { providePeopleContext } from '$lib/people/context.svelte';
	import { createDeviceUnlock } from '$lib/privacy/device-unlock.svelte';
	import { provideVeil } from '$lib/privacy/veil.svelte';
	import { reportNavigation } from '$lib/sync/pending';
	import { followScroll, SHOWN_TOP_BAR } from '$lib/ui/top-bar';
	import { breadcrumbs, type CrumbData } from '$lib/ui/breadcrumbs';
	import { onMount, untrack, type Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	import { keepShellCurrent } from './shell-lifecycle.svelte';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const t = useTranslate();

	// Primary destinations. `match` decides the active state from the pathname; the label is
	// a message key so the sidebar follows the viewer's language.
	const nav: { href: string; label: MessageKey; icon: IconName; match: (p: string) => boolean }[] =
		[
			{ href: '/', label: 'nav.home', icon: 'home', match: (p) => p === '/' },
			{
				href: '/contacts',
				label: 'nav.people',
				icon: 'people',
				match: (p) => p.startsWith('/contacts')
			},
			{
				href: '/circles',
				label: 'nav.circles',
				icon: 'circles',
				match: (p) => p.startsWith('/circles')
			},
			{ href: '/graph', label: 'nav.graph', icon: 'graph', match: (p) => p.startsWith('/graph') },
			{
				href: '/settings',
				label: 'nav.settings',
				icon: 'settings',
				match: (p) => p.startsWith('/settings')
			}
		];
	const isActive = (item: (typeof nav)[number]) => item.match(page.url.pathname);
	// The phone's tab bar has five places and the pencil takes the middle one; Settings is
	// rarely opened and moves to the top bar there.
	const tabBar = nav.filter((item) => item.href !== '/settings');

	/** Home itself, where a phone's search is the field on the page rather than the top bar's. */
	const onHome = $derived(page.route.id === '/(app)');
	// The trail from the route id + merged page data (contact/circle names, a circle's ancestors).
	const crumbs = $derived(breadcrumbs(page.route.id ?? '', page.data as CrumbData, page.params, t));

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
	$effect(() => {
		// The teardown ends the navigation it began.
		return reportNavigation(pending, navigating.to);
	});

	const removals = provideRemovals();
	providePeopleContext(() => data.peopleContext);
	// The member's private entries stay blurred until asked for (docs/02 §2.10.1). A tap shows
	// one until the page is left; a new page starts blurred again, the five-minute window aside.
	const veil = provideVeil({
		enabled: () => data.user.blurPrivate,
		device: createDeviceUnlock(untrack(() => data.user)),
		onUnlockFailed: () => removals.notify(t('privacy.unlock.failed'))
	});
	afterNavigate(({ from, to }) => {
		if (from?.url.pathname !== to?.url.pathname) veil.leftPage();
	});
	keepShellCurrent({
		data: () => ({ userId: data.user.id, people: data.people, peopleStamp: data.peopleStamp }),
		removals,
		outboxPhrases: {
			photoTooLarge: t('home.outbox.photoTooLarge'),
			earlierVersion: t('home.outbox.earlierVersion')
		}
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
</script>

<svelte:window onkeydown={onGlobalKeydown} />

<!--
	One indicator for the whole app (docs/05 §5.7): a page still loading, and any change a page
	reported through the pending-work store — a relationship save and the graph reload behind
	it. It is fixed to the top of the window, so it never moves the page it reports on.
-->
<ActivityIndicator busy={pending.busy} label={pending.label ?? t('common.updating')} />
<CommandPalette people={data.people} bind:open={paletteOpen} />
<Toast />

<!-- The visible height, not 100vh: a phone browser counts 100vh with its address bar hidden,
     so a shell that tall runs its foot under the fixed tab bar while the bar is showing. The
     body is held to the same height (`app.css`), so the document never scrolls: only `#content`
     does, and the motion helpers scroll it alone (`scrollTopToShow`, docs/05 §5.11) — a scrolled
     document would carry the top bar and the sticky jump bar off the top of the screen. -->
<!-- The first stop for a keyboard: past the sidebar and the top bar to the page itself. -->
<a
	href="#content"
	class="sr-only z-50 rounded-control bg-card text-sm font-medium text-fg shadow-pop focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:px-3 focus:py-2"
>
	{t('nav.skipToContent')}
</a>

<div
	class="flex h-dvh w-full overflow-hidden bg-bg text-fg print:h-auto print:overflow-visible print:bg-transparent"
>
	<!-- Sidebar (desktop) -->
	<aside class="hidden w-60 shrink-0 flex-col gap-1 bg-bg-sunken p-3 md:flex print:hidden">
		<a href="/" class="mb-3 flex items-center px-2 py-1.5" aria-label={t('nav.stellaHome')}>
			<Logo size={26} wordmark welcomeTarget />
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

		<AccountMenu name={data.user.name} email={data.user.email} />
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
			class="flex items-center gap-3 px-4 py-3 transition-[margin-top] duration-350 ease-in-out motion-reduce:transition-none md:px-6 print:hidden {topBar.hidden
				? 'max-md:-mt-(--top-bar-height)'
				: ''}"
			data-testid="top-bar"
			data-hidden={topBar.hidden}
		>
			<!-- On Home the trail would be "Home" alone, which the tab bar and sidebar already say;
			     a phone, which has no sidebar, shows the logo there instead. -->
			{#if crumbs.length <= 1}
				<a href="/" class="flex items-center md:hidden" aria-label={t('nav.stellaHome')}
					><Logo size={26} wordmark welcomeTarget /></a
				>
			{:else}
				<!-- A phone shows only the way back: the page's own name is its card's headline, and the
				     whole trail would wrap a long one onto a second line (docs/05 §5.4). -->
				{@const parent = crumbs[crumbs.length - 2]}
				<nav aria-label={t('nav.breadcrumb')} class="min-w-0 text-sm md:hidden">
					<a
						href={parent.href}
						class="-ml-1 flex min-w-0 items-center gap-0.5 rounded-control py-1 pr-1 text-fg-muted hover:text-fg"
						data-testid="back-crumb"
						><Icon name="back" size={16} /><span class="truncate">{parent.label}</span></a
					>
				</nav>
				<nav
					aria-label={t('nav.breadcrumb')}
					class="flex min-w-0 flex-wrap items-center gap-1.5 text-sm max-md:hidden"
				>
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
				<VeilLock />
				<!-- On a phone's Home the *Find a person* field under the bar is the search, so a second
				     door to the same list would only have to be learned as the same (docs/05 §5.4).
				     ⌘K still opens the palette there. -->
				<button
					type="button"
					onclick={() => (paletteOpen = true)}
					disabled={!paletteReady}
					class="flex items-center gap-2 rounded-control bg-card px-3 py-2 text-sm text-fg-subtle shadow-card transition-colors hover:text-fg {onHome
						? 'max-md:hidden'
						: ''}"
					aria-label={t('nav.search')}
					aria-keyshortcuts="Meta+K Control+K"
				>
					<Icon name="search" size={15} />
					<!-- The same words as the button's name, so a voice command can say what it reads
					     (WCAG 2.5.3); the name stays for widths where the words are hidden. -->
					<span class="hidden lg:inline">{t('nav.search')}</span>
					<kbd class="hidden rounded border border-border px-1 text-[10px] font-medium lg:inline"
						>⌘K</kbd
					>
				</button>
				<!-- Secondary, not primary: the one filled action on a screen is the page's own — the
				     pencil on Home, *Write a moment* on a person (docs/05 §5.1, §5.4). -->
				<Button
					variant="secondary"
					icon="addPerson"
					href="/contacts/new"
					label={t('nav.addPerson')}
				>
					<span class="hidden md:inline">{t('nav.addPerson')}</span>
				</Button>
				<!-- Wrapped: the button's own display rule would outrank a utility on the element. -->
				<span class="md:hidden"
					><Button
						variant="ghost"
						icon="settings"
						href="/settings"
						label={t('nav.settings')}
					/></span
				>
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
				(topBar = followScroll(
					topBar,
					page.scrollTop,
					topBarHeight,
					page.scrollHeight - page.clientHeight
				))}
			class="flex-1 overflow-y-auto pb-16 md:pb-0 print:overflow-visible print:pb-0"
		>
			{@render children()}
		</div>
	</div>

	<!-- Bottom tab bar (mobile) -->
	<nav
		aria-label={t('nav.main')}
		class="fixed inset-x-0 bottom-0 z-20 flex border-t border-border-subtle bg-card md:hidden print:hidden"
	>
		{#each tabBar.slice(0, 2) as item (item.href)}
			<a href={item.href} aria-current={isActive(item) ? 'page' : undefined} class={TAB}>
				{#if isActive(item)}<span class={TAB_MARK} aria-hidden="true"></span>{/if}
				<Icon name={item.icon} size={20} />
				{t(item.label)}
			</a>
		{/each}
		<a
			href="/?compose"
			onclick={openComposer}
			class="flex flex-1 flex-col items-center py-2.5"
			aria-label={t('nav.writeMoment')}
		>
			<span
				class="-mt-4 grid size-11 place-items-center rounded-full bg-primary text-primary-fg shadow-pop"
			>
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
