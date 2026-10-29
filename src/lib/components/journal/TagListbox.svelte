<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { accentChipStyle } from '$lib/design/tokens';
	import { tagAccent } from '$lib/hashtags/hashtags';
	import type { TagRow } from '$lib/hashtags/picker';
	import { useTranslate } from '$lib/i18n/context.svelte';

	/*
	 * The `#` list (docs/02 §2.20.2): the household's tags matching what is typed, then the typed
	 * word as a new tag. The field keeps focus and points here with aria-activedescendant, as with
	 * the `@` list; where the list sits is the host's (`class`).
	 */
	interface Props {
		id: string;
		rows: readonly TagRow[];
		highlighted: number;
		optionId: (index: number) => string;
		onchoose: (index: number) => void;
		onhighlight: (index: number) => void;
		class?: string;
	}
	let {
		id,
		rows,
		highlighted,
		optionId,
		onchoose,
		onhighlight,
		class: className = ''
	}: Props = $props();

	const t = useTranslate();
</script>

<ul
	{id}
	role="listbox"
	aria-label={t('composer.tags')}
	data-testid="tag-picker"
	class="absolute z-10 w-[min(320px,calc(100%-1rem))] rounded-app border border-border bg-card p-1 shadow-pop {className}"
>
	<!-- A caption for the eye; the listbox carries the same words as its name. -->
	<li
		role="presentation"
		aria-hidden="true"
		class="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-wider text-fg-muted uppercase"
	>
		{t('composer.tags')}
	</li>
	{#each rows as row, i (row.kind === 'tag' ? row.tag.key : 'new')}
		<li role="none">
			<button
				type="button"
				role="option"
				id={optionId(i)}
				tabindex="-1"
				aria-selected={i === highlighted}
				onmousedown={(e) => {
					e.preventDefault();
					onchoose(i);
				}}
				onmouseenter={() => onhighlight(i)}
				class="flex w-full items-center gap-2.5 rounded-control px-2.5 py-1.5 text-left text-sm text-fg aria-selected:bg-primary-soft"
			>
				{#if row.kind === 'tag'}
					<span
						class="inline-flex min-w-0 items-center gap-1 rounded-full px-2 py-0.5 font-medium"
						style={accentChipStyle(tagAccent(row.tag.name))}
					>
						{#if row.tag.onlyPrivate}<Icon
								name="private"
								size={11}
								label={t('journal.tags.onlyYou')}
							/>{/if}
						<span class="truncate">#{row.tag.name}</span>
					</span>
					<span class="ml-auto text-xs text-fg-subtle">{row.tag.count}</span>
				{:else}
					<span
						class="grid size-[22px] place-items-center rounded-full border border-dashed border-success text-success-text"
						aria-hidden="true">#</span
					>
					<span class="min-w-0 truncate font-semibold text-success-text">#{row.name}</span>
					<span class="ml-auto text-xs text-fg-subtle">{t('composer.newTag')}</span>
				{/if}
			</button>
		</li>
	{/each}
</ul>
