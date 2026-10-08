<script lang="ts">
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

<MenuButton label={t('graph.arrange.current', { name: t(arrangedLabel) })}>
	{#snippet trigger()}
		<!-- The pill's label keeps "Arrange:" for assistive tech; a phone shows the name only. -->
		<span class="sm:hidden">{t(arrangedLabel)}</span>
		<span class="max-sm:hidden">{t('graph.arrange.current', { name: t(arrangedLabel) })}</span>
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
				<span class="w-3 shrink-0 font-bold text-primary" aria-hidden="true">
					{#if arrangedBy === arrangement.key}✓{/if}
				</span>
				<span class="flex-1">
					{t(arrangement.label)}
					<span class="block text-[11px] text-fg-subtle">{t(arrangement.hint)}</span>
				</span>
			</button>
		{/each}
	{/snippet}
</MenuButton>
