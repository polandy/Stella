<script lang="ts">
	import type { Segment } from '$lib/i18n/linked';

	/*
	 * A sentence whose names are ways to those people (docs/05 §5.4, docs/02 §2.4.1).
	 *
	 * The sentence arrives already said and already cut up — the language decided where each
	 * person landed (`src/lib/i18n/linked.ts`) — so there is nothing to interpolate here.
	 *
	 * A name is underlined in the text's own colour rather than set in the link colour: the two
	 * buttons beside it are the call to action, and a review row carries up to six names. In link
	 * blue the page reads as a field of links with a sentence hidden in it.
	 *
	 * The underline is drawn in `fg-subtle` rather than in `border`: measured on the dark theme,
	 * a border-coloured rule (#313244) all but vanished against the row it sits on, which left
	 * the names looking like plain text in one theme and like links in the other.
	 */
	let { segments }: { segments: readonly Segment[] } = $props();
</script>

{#each segments as segment}{#if 'person' in segment}<a
			href="/contacts/{segment.person.id}"
			class="underline decoration-fg-subtle underline-offset-2 hover:text-primary hover:decoration-primary"
			>{segment.person.name}</a
		>{:else}{segment.text}{/if}{/each}
