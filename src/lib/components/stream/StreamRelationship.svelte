<script lang="ts">
	import StreamFace from '$lib/components/stream/StreamFace.svelte';
	import StreamWhen from '$lib/components/stream/StreamWhen.svelte';
	import { relationshipRowLabel } from '$lib/relationships/labels';
	import type { StreamTime } from '$lib/stream/days';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { PageData } from '../../../routes/(app)/$types';

	/** The stream item as Home's `load` hands it over. */
	type Item = Extract<PageData['stream'][number], { kind: 'relationship' }>;

	/*
	 * A relationship recorded between two people, as the stream shows it (docs/02 §2.22.2):
	 * *Anna linked Ben → father of → Carl*. The row's cells; Home draws the row.
	 */
	let {
		item,
		who,
		time,
		members
	}: {
		item: Item;
		/** The actor's name, or *You*. */
		who: string;
		/** When it happened, as the stream says it. */
		time: StreamTime;
		/** The household's members, for the face's badge. */
		members: readonly unknown[];
	} = $props();

	const t = useTranslate();
</script>

<StreamFace person={item.from} row={item} {members} />
<div class="min-w-0">
	<div class="flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-fg-muted">
		<b class="font-semibold text-fg">{who}</b>
		<span>{t('home.stream.linked')}</span>
		<a href="/contacts/{item.from.id}" class="font-medium text-fg hover:underline"
			>{item.from.name}</a
		>
		<span class="text-fg-subtle">→</span>
		<span>{relationshipRowLabel(t, item)}</span>
		<a href="/contacts/{item.to.id}" class="font-medium text-fg hover:underline">{item.to.name}</a>
		{#if t('home.stream.linkedAfter')}<span>{t('home.stream.linkedAfter')}</span>{/if}
		<span
			class="rounded bg-link/16 px-1.5 text-[10px] font-semibold tracking-wide text-fg uppercase"
			>{t('home.stream.relationship')}</span
		>
		<StreamWhen {time} />
	</div>
</div>
