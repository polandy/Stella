<!--
  @component
  The picker's two ways in (docs/dev/02 §2.24.9): the timeline, or the albums. Each tab goes back to
  where it was last.
-->
<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import Tabs from '$lib/components/ui/Tabs.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { LibraryTab } from '$lib/immich/library-albums';

	interface Props {
		chosen: LibraryTab;
		onchoose: (tab: LibraryTab) => void;
		idPrefix: string;
		/** The id of the picker's body, which the tabs control. */
		panel: string;
	}

	let { chosen, onchoose, idPrefix, panel }: Props = $props();

	const t = useTranslate();
	const TABS = ['time', 'albums'] as const;
</script>

<Tabs
	tabs={TABS}
	{chosen}
	{onchoose}
	label={t('immich.library.ways')}
	{idPrefix}
	{panel}
	testid="immich-library-tabs"
>
	{#snippet content(tab)}
		<span class="inline-flex items-center justify-center gap-1.5">
			<Icon name={tab === 'time' ? 'calendar' : 'photo'} size={14} />
			{tab === 'time' ? t('immich.library.tabTime') : t('immich.library.tabAlbums')}
		</span>
	{/snippet}
</Tabs>
