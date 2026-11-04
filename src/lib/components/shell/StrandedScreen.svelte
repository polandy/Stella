<script lang="ts">
	import { page } from '$app/state';
	import Button from '$lib/components/ui/Button.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import type { IconName } from '$lib/components/ui/icons';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { MessageKey } from '$lib/i18n/translate';
	import { strandedPlace, type StrandedPlace } from '$lib/ui/stranded';

	/*
	 * Where an address that leads nowhere lands (docs/design/screens/across-screens.md): an
	 * empty state naming what was asked for and the way to its list, never the bare status.
	 * Inside the app it sits in the shell, so the tab bar and the parent crumb stay in reach.
	 */
	const t = useI18n().t;

	type Way = { icon: IconName; title: MessageKey; hint?: MessageKey; href: string; to: MessageKey };
	const WAYS: Record<StrandedPlace, Way> = {
		person: {
			icon: 'people',
			title: 'errors.stranded.person',
			hint: 'errors.stranded.personHint',
			href: '/contacts',
			to: 'errors.stranded.allPeople'
		},
		circle: {
			icon: 'circles',
			title: 'errors.stranded.circle',
			hint: 'errors.stranded.circleHint',
			href: '/circles',
			to: 'errors.stranded.allCircles'
		},
		immich: {
			icon: 'photo',
			title: 'errors.stranded.immich',
			hint: 'errors.stranded.immichHint',
			href: '/settings',
			to: 'nav.settings'
		},
		settings: {
			icon: 'settings',
			title: 'errors.stranded.setting',
			hint: 'errors.stranded.settingHint',
			href: '/settings',
			to: 'nav.settings'
		},
		elsewhere: {
			icon: 'search',
			title: 'errors.stranded.page',
			hint: 'errors.stranded.pageHint',
			href: '/',
			to: 'nav.home'
		},
		// The server's message says why; it arrives in the reader's language (`handleError`).
		failed: { icon: 'conflict', title: 'errors.stranded.failed', href: '/', to: 'nav.home' }
	};

	const place = $derived(strandedPlace(page.status, page.url.pathname));
	const way = $derived(WAYS[place]);
	const hint = $derived(way.hint ? t(way.hint) : page.error?.message);
</script>

<svelte:head><title>{t('common.pageTitle', { page: t(way.title) })}</title></svelte:head>

<main
	class="mx-auto flex w-full max-w-2xl flex-col px-6 py-10"
	data-testid="stranded"
	data-place={place}
>
	<EmptyState icon={way.icon} title={t(way.title)} {hint} heading>
		<Button variant="primary" href={way.href}>{t(way.to)}</Button>
	</EmptyState>
</main>
