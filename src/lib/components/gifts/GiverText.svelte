<script lang="ts">
	import type { GiverSegment } from '#lib/gifts/labels.js';

	/* A giver phrase whose people are links to their pages (docs/dev/02 §2.25.12). */
	let { segments }: { segments: GiverSegment[] } = $props();
</script>

{#each segments as segment, at (at)}
	{#if segment.contactId}
		<a href="/contacts/{segment.contactId}" class="underline-offset-2 hover:underline">
			{segment.text}
		</a>
	{:else}
		{segment.text}
	{/if}
{/each}
