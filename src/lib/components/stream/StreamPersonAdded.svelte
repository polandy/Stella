<script lang="ts">
	import PrivateMark from '$lib/components/ui/PrivateMark.svelte';
	import StreamFace from '$lib/components/stream/StreamFace.svelte';
	import StreamWhen from '$lib/components/stream/StreamWhen.svelte';
	import type { StreamTime } from '$lib/stream/days';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { PageData } from '../../../routes/(app)/$types';

	/** The stream item as Home's `load` hands it over. */
	type Item = Extract<PageData['stream'][number], { kind: 'person' }>;

	/*
	 * Somebody new in the household's book, as the stream shows it (docs/02 §2.22.2): *Anna
	 * added Ben*, marked new, with what they are known by. The row's cells; Home draws the row.
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

<StreamFace person={item.person} row={item} {members} />
<div class="min-w-0">
	<div class="flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-fg-muted">
		<b class="font-semibold text-fg">{who}</b>
		<span>{t('home.stream.added')}</span>
		<a href="/contacts/{item.person.id}" class="font-medium text-fg hover:underline"
			>{item.person.name}</a
		>
		{#if t('home.stream.addedAfter')}<span>{t('home.stream.addedAfter')}</span>{/if}
		<span
			class="rounded bg-success/16 px-1.5 text-[10px] font-semibold tracking-wide text-fg uppercase"
			>{t('home.stream.newPerson')}</span
		>
		{#if item.visibility === 'private'}<PrivateMark class="text-[11px]" />{/if}
		<StreamWhen {time} />
	</div>
	{#if item.description}<p class="mt-0.5 text-sm text-fg-muted">
			{item.description}
		</p>{/if}
</div>
