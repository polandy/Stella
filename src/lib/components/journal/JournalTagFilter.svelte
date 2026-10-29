<script lang="ts">
	import TagChip from '$lib/components/journal/TagChip.svelte';
	import { journalTagToggle } from '$lib/hashtags/hashtags';
	import type { KnownTag } from '$lib/hashtags/picker';
	import { useI18n } from '$lib/i18n/context.svelte';

	/*
	 * The journal filtered by tags (docs/02 §2.20.2, docs/design/screens/person.md). Each chip is
	 * a link that adds its tag to `?tag=` or takes it off — an entry must carry every chosen tag — so the filter is an address: it survives a reload, can be shared within
	 * the household, and Back undoes it. No row while nothing on this journal is tagged.
	 */
	interface Props {
		tags: readonly KnownTag[];
		/** The chosen tags, in the order chosen; empty for every entry. */
		active: readonly { key: string; name: string }[];
		/** How many entries the filter leaves, for the note under the row. */
		shown: number;
	}
	let { tags, active, shown }: Props = $props();

	const t = useI18n().t;
	const chosen = $derived(active.map((tag) => tag.key));
	const chip = 'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-medium';
</script>

{#if tags.length || active.length}
	<nav aria-label={t('journal.tags.filter')} class="flex flex-col gap-2">
		<ul class="flex flex-wrap gap-1.5">
			<li>
				<a
					href="?"
					class="{chip} {active.length
						? 'text-fg-muted hover:text-fg'
						: 'bg-card text-fg shadow-card'}"
					aria-current={active.length ? undefined : 'page'}>{t('journal.tags.all')}</a
				>
			</li>
			{#each tags as tag (tag.key)}
				<li>
					<TagChip
						{tag}
						href={journalTagToggle(chosen, tag.key)}
						current={chosen.includes(tag.key)}
					/>
				</li>
			{/each}
		</ul>
		{#if active.length}
			<p class="text-sm text-fg-muted" aria-live="polite">
				{t('journal.tags.filtered', { count: shown, names: active.map((tag) => tag.name) })}<span
					class="mx-1.5"
					aria-hidden="true">·</span
				><a href="?" class="text-link underline">{t('journal.tags.showAll')}</a>
			</p>
		{/if}
	</nav>
{/if}
