<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import MenuButton from '$lib/components/ui/MenuButton.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { ARRANGEMENTS, type ArrangementKey } from '$lib/graph/layout/arrangements';
	import { MENU_ITEM } from './menu-item';

	interface Props {
		/** The arrangement last chosen, which the pill names; free until one is picked. */
		arrangedBy: ArrangementKey;
		onArrange: (key: ArrangementKey) => void;
	}
	let { arrangedBy, onArrange }: Props = $props();

	const t = useTranslate();
	const arrangedLabel = $derived(ARRANGEMENTS.find((a) => a.key === arrangedBy)!.label);
</script>

<!-- A phone shows the icon only, so the toolbar keeps one row; the label still names the choice. -->
<MenuButton label={t('graph.arrange.current', { name: t(arrangedLabel) })} phoneIcon="mapLayout">
	{#snippet trigger()}
		{t('graph.arrange.current', { name: t(arrangedLabel) })}
	{/snippet}
	{#snippet children({ close })}
		{#each ARRANGEMENTS as arrangement (arrangement.key)}
			<button
				type="button"
				role="menuitemradio"
				aria-checked={arrangedBy === arrangement.key}
				onclick={() => {
					onArrange(arrangement.key);
					close();
				}}
				class={MENU_ITEM}
			>
				<span class="flex w-3 shrink-0 text-primary">
					{#if arrangedBy === arrangement.key}<Icon name="done" size={12} strokeWidth={2.5} />{/if}
				</span>
				<span class="flex-1">
					{t(arrangement.label)}
					<span class="block text-[11px] text-fg-subtle">{t(arrangement.hint)}</span>
				</span>
			</button>
		{/each}
	{/snippet}
</MenuButton>
