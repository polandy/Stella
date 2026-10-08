<script lang="ts">
	import type { PhotoTab } from '$lib/people/photo-card';
	import { useI18n } from '$lib/i18n/context.svelte';

	/*
	 * The Photos card's segmented control (docs/design/screens/person.md): *All · Stella 5 ·
	 * Immich 1,764*. Tabs in the ARIA sense, so the arrow keys move between them and only the
	 * chosen one is a Tab stop — the pattern of the Immich settings page.
	 */
	interface Props {
		tabs: readonly PhotoTab[];
		chosen: PhotoTab;
		/** How many photos the gallery holds. */
		stellaCount: number;
		/** How many Immich has of the person, or null when it may not count them. */
		immichCount: number | null;
		/** The id of the panel the tabs control. */
		panel: string;
		onchoose: (tab: PhotoTab) => void;
	}
	let { tabs, chosen, stellaCount, immichCount, panel, onchoose }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const shownCount = (count: number) => new Intl.NumberFormat(i18n.intlLocale).format(count);

	const NAMES = {
		all: 'contact.photos.tabAll',
		stella: 'contact.photos.tabStella',
		immich: 'contact.photos.tabImmich'
	} as const;
	const countOf = (tab: PhotoTab): number | null =>
		tab === 'stella' ? stellaCount : tab === 'immich' ? immichCount : null;

	function step(event: KeyboardEvent) {
		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
		event.preventDefault();
		const at = tabs.indexOf(chosen) + (event.key === 'ArrowRight' ? 1 : -1);
		const next = tabs[(at + tabs.length) % tabs.length];
		if (next === undefined) return;
		onchoose(next);
		document.getElementById(`photo-tab-${next}`)?.focus();
	}
</script>

<div
	role="tablist"
	aria-label={t('contact.photos.tabsLabel')}
	tabindex="-1"
	class="flex w-fit max-w-full gap-0.5 rounded-full bg-bg-sunken p-0.5"
	onkeydown={step}
	data-testid="photo-tabs"
>
	{#each tabs as tab (tab)}
		{@const count = countOf(tab)}
		<button
			type="button"
			role="tab"
			id="photo-tab-{tab}"
			aria-selected={chosen === tab}
			aria-controls={panel}
			tabindex={chosen === tab ? 0 : -1}
			onclick={() => onchoose(tab)}
			class="rounded-full px-2.5 py-1 text-xs whitespace-nowrap text-fg-muted transition-colors hover:text-fg aria-selected:bg-card aria-selected:font-medium aria-selected:text-fg aria-selected:shadow-card"
		>
			{t(NAMES[tab])}{#if count !== null}<span class="ml-1 text-fg-subtle tabular-nums"
					>{shownCount(count)}</span
				>{/if}
		</button>
	{/each}
</div>
