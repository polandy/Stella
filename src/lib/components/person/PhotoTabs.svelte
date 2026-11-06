<script lang="ts">
	import type { PhotoTab } from '$lib/people/photo-card';
	import { useI18n } from '$lib/i18n/context.svelte';
	import Tabs from '$lib/components/ui/Tabs.svelte';

	/*
	 * The Photos card's segmented control (docs/design/screens/person.md): *All · Stella 5 ·
	 * Immich 1,764*: the shared tab list, small, with each source's count.
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
</script>

<Tabs
	{tabs}
	{chosen}
	{onchoose}
	label={t('contact.photos.tabsLabel')}
	idPrefix="photo-tab"
	{panel}
	size="small"
	testid="photo-tabs"
>
	{#snippet content(which)}
		{@const count = countOf(which)}
		{t(NAMES[which])}{#if count !== null}<span class="ml-1 text-fg-subtle tabular-nums"
				>{shownCount(count)}</span
			>{/if}
	{/snippet}
</Tabs>
