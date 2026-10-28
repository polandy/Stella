<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { accentChipStyle } from '$lib/design/tokens';
	import { tagAccent } from '$lib/hashtags/hashtags';
	import type { KnownTag } from '$lib/hashtags/picker';
	import { useI18n } from '$lib/i18n/context.svelte';

	/*
	 * The journal filtered by a tag (docs/02 §2.20.2, docs/design/screens/person.md). Each chip is
	 * a link to `?tag=`, so the filter is an address: it survives a reload, can be shared within
	 * the household, and Back undoes it. No row while nothing on this journal is tagged.
	 */
	interface Props {
		tags: readonly KnownTag[];
		active: { key: string; name: string } | null;
		/** How many entries the filter leaves, for the note under the row. */
		shown: number;
	}
	let { tags, active, shown }: Props = $props();

	const t = useI18n().t;
	const chip = 'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-medium';
</script>

{#if tags.length || active}
	<nav aria-label={t('journal.tags.filter')} class="flex flex-col gap-2">
		<ul class="flex flex-wrap gap-1.5">
			<li>
				<a
					href="?"
					class="{chip} {active ? 'text-fg-muted hover:text-fg' : 'bg-card text-fg shadow-card'}"
					aria-current={active ? undefined : 'page'}>{t('journal.tags.all')}</a
				>
			</li>
			{#each tags as tag (tag.key)}
				{@const current = active?.key === tag.key}
				<li>
					<a
						href="?tag={encodeURIComponent(tag.key)}"
						class="{chip} {current ? 'ring-2 ring-focus-ring' : ''}"
						style={accentChipStyle(tagAccent(tag.name), { active: current })}
						aria-current={current ? 'page' : undefined}
						title={tag.onlyPrivate ? t('journal.tags.onlyYou') : undefined}
					>
						{#if tag.onlyPrivate}<Icon
								name="private"
								size={11}
								label={t('journal.tags.onlyYou')}
							/>{/if}
						#{tag.name}
						<span class="text-xs text-fg-muted">{tag.count}</span>
					</a>
				</li>
			{/each}
		</ul>
		{#if active}
			<p class="text-sm text-fg-muted" aria-live="polite">
				{t('journal.tags.filtered', { count: shown, name: active.name })} ·
				<a href="?" class="text-link underline">{t('journal.tags.showAll')}</a>
			</p>
		{/if}
	</nav>
{/if}
