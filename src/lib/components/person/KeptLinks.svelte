<script lang="ts">
	import KeptItem from '$lib/components/pwa/KeptItem.svelte';
	import { isKept, type KeptOf } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';

	/*
	 * Links entered on this person while Stella was out of reach, kept until they are sent (docs/02
	 * §2.18). The guardrails are the server's: a link that has meanwhile become a duplicate or a
	 * contradiction comes back refused, with the reason. Named the way the picker names them.
	 */
	let {
		contactId,
		labelOf
	}: {
		contactId: string;
		/** "Child of Anna Brunner and Bert Brunner", for a kept link or batch. */
		labelOf: (typeChoice: string, targetIds: readonly string[]) => string;
	} = $props();

	const keptLinks = $derived(
		outbox.mine.filter(
			(item): item is KeptOf<'relationship.add'> | KeptOf<'relationship.addMany'> =>
				(isKept(item, 'relationship.add') || isKept(item, 'relationship.addMany')) &&
				item.command.payload.contactId === contactId
		)
	);
	/** Who a kept link or batch is with: one person, or everyone picked for it. */
	const keptTargets = (item: (typeof keptLinks)[number]): string[] =>
		item.command.type === 'relationship.addMany'
			? item.command.payload.links.map((link) => link.targetId)
			: [item.command.payload.targetId];
</script>

{#if keptLinks.length > 0}
	<ul class="mb-3 flex flex-col gap-2" data-testid="kept-links">
		{#each keptLinks as item (item.command.id)}
			<li>
				<KeptItem {item}>
					<p class="mt-1 text-fg">
						{labelOf(item.command.payload.typeChoice, keptTargets(item))}
					</p>
				</KeptItem>
			</li>
		{/each}
	</ul>
{/if}
