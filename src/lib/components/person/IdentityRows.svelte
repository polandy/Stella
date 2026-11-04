<script lang="ts">
	import { reveal } from '$lib/motion/motion.svelte';
	import Section from '$lib/components/ui/Section.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { ProfileRow } from '$lib/people/identity-card';
	import ContactFieldsRow from './ContactFieldsRow.svelte';
	import TagsRow from './TagsRow.svelte';
	import type { PersonForm, PersonPageData } from './types';

	/*
	 * The identity card's rows that have no fact: the ways to reach someone but their address,
	 * the tags, and how we met. An empty one waits behind the quiet button with the empty facts.
	 */
	let {
		data,
		form,
		rows,
		metLine
	}: {
		data: PersonPageData;
		form: PersonForm;
		rows: ProfileRow[];
		/** How this person came into the household's life, as one line, or null. */
		metLine: string | null;
	} = $props();

	const t = useTranslate();
</script>

{#if rows.length > 0 || metLine}
	<div class="identity-rows grid gap-x-8" transition:reveal>
		{#each rows as row (row)}
			<!-- Rows the quiet button brings unfold in place (docs/05 §5.11). -->
			<div data-identity-row={row} class="min-w-0" transition:reveal>
				{#if row === 'contact'}
					<ContactFieldsRow {data} {form} />
				{:else if row === 'tags'}
					<TagsRow {data} {form} />
				{/if}
			</div>
		{/each}
		{#if metLine}
			<div class="min-w-0">
				<Section as="row" title={t('contact.section.howWeMet')} startOpen>
					<p class="font-serif text-[15px] leading-relaxed text-fg">{metLine}</p>
				</Section>
			</div>
		{/if}
	</div>
{/if}

<style>
	/*
	 * Each row draws the line above itself and the first one does not. Wrapped in a cell, every
	 * row is its cell's first: the line is drawn here instead, between cells — and once the card
	 * is wide enough for the rows to stand two abreast, not above the second column's first row
	 * either. The card's own width decides, not the viewport's (IdentityCard).
	 */
	.identity-rows > :global(*) > :global(*) {
		border-top-width: 0;
	}
	.identity-rows > :global(* + *) {
		border-top: 1px solid var(--border-subtle);
	}
	@container facts (width >= 36rem) {
		.identity-rows > :global(:nth-child(2)) {
			border-top-width: 0;
		}
	}

	/*
	 * Each row is a line and its actions (Section's `as="row"`). The rows share their columns
	 * through subgrid, so the actions of every row in a column start at one edge and their "+"
	 * icons stand one above the other, whatever each label's length — "Hinzufügen" over
	 * "Beitreten" no longer leaves the two icons a few pixels apart. A row that is not a
	 * Section (job, gender) spans the pair.
	 */
	.identity-rows {
		grid-template-columns: minmax(0, 1fr) auto;
	}
	@container facts (width >= 36rem) {
		.identity-rows {
			grid-template-columns: repeat(2, minmax(0, 1fr) auto);
		}
	}
	.identity-rows > :global(*) {
		display: grid;
		grid-column: span 2;
		grid-template-columns: subgrid;
		column-gap: 0.5rem;
		/* A neighbour's open form makes the grid row tall; this row stays at its top. */
		align-content: start;
	}
	.identity-rows > :global(*) > :global(*) {
		grid-column: 1 / -1;
	}
	.identity-rows > :global(*) > :global(section[data-row]) {
		grid-template-columns: subgrid;
	}
</style>
