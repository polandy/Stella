<script lang="ts">
	import KeptItem from '#lib/components/pwa/KeptItem.svelte';
	import type { KeptOf } from '#lib/pwa/outbox.js';

	/** Gifts noted here while Stella was out of reach (docs/dev/02 §2.18), until they are sent. */
	let { kept }: { kept: KeptOf<'gift.add'>[] } = $props();
</script>

{#if kept.length > 0}
	<ul class="mb-3 flex flex-col gap-2" data-testid="kept-gifts">
		{#each kept as item (item.command.id)}
			<li>
				<KeptItem {item}>
					<p class="mt-1 text-fg">{item.command.payload.title}</p>
				</KeptItem>
			</li>
		{/each}
	</ul>
{/if}
