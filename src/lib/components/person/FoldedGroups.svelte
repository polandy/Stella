<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { WORKED_OUT, type HiddenGroup } from '$lib/relationships/people-groups';

	/*
	 * What the relationships card's fold hides, by group: every group folded away whole with its
	 * count, the worked-out block last — a group partly shown is counted by its own heading. Each
	 * one unfolds the card and lands on that group.
	 */
	let {
		groups,
		onShow
	}: {
		groups: HiddenGroup[];
		onShow: (group: HiddenGroup['group']) => void;
	} = $props();

	const t = useI18n().t;

	const label = (hidden: HiddenGroup) =>
		hidden.group === WORKED_OUT
			? t('contact.relationships.derivedShort')
			: t(`contact.relationships.group.${hidden.group}`);
</script>

<ul
	class="mt-1 flex list-none flex-wrap items-center gap-x-1 gap-y-0.5 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase"
	aria-label={t('contact.relationships.foldedAway')}
	data-testid="people-folded-groups"
>
	{#each groups as hidden, index (hidden.group)}
		<li class="flex items-center gap-1">
			{#if index > 0}<span class="text-border" aria-hidden="true">·</span>{/if}
			<button
				type="button"
				class="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-2 py-1 tracking-wide uppercase hover:border-solid hover:bg-card-hover hover:text-fg"
				aria-label={t('contact.relationships.showGroup', {
					group: label(hidden),
					count: hidden.count
				})}
				onclick={() => onShow(hidden.group)}
			>
				{#if hidden.group === WORKED_OUT}<Icon name="explore" size={12} />{/if}
				{label(hidden)} · {hidden.count}
			</button>
		</li>
	{/each}
</ul>
