<script lang="ts">
	import PrivateMark from '$lib/components/ui/PrivateMark.svelte';
	import Veil from '$lib/components/ui/Veil.svelte';
	import StreamFace from '$lib/components/stream/StreamFace.svelte';
	import StreamWhen from '$lib/components/stream/StreamWhen.svelte';
	import type { StreamTime } from '$lib/stream/days';
	import { journalTagHref } from '$lib/hashtags/hashtags';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { PageData } from '../../../routes/(app)/$types';

	/** The moment as the stream's `load` hands it over (`streamForView`). */
	type MomentItem = Extract<PageData['stream'][number], { kind: 'moment' }>;

	/*
	 * A moment in a stream (docs/02 §2.22.2): who wrote it in whose journal, its words and photos,
	 * a private one veiled (§2.10.1). The row's cells, for Home and a tag's page alike; the page
	 * draws the row around them.
	 */
	interface Props {
		item: MomentItem;
		members: readonly unknown[];
		when: StreamTime;
		/** On a tag's page, the tag the person's journal opens filtered by (docs/02 §2.20.2). */
		tag?: string;
	}
	let { item, members, when, tag }: Props = $props();

	const journalHref = $derived(
		tag ? journalTagHref(item.anchor.id)(tag) : `/contacts/${item.anchor.id}/journal`
	);

	const t = useI18n().t;
</script>

<StreamFace person={item.anchor} row={item} {members} />
<div class="min-w-0">
	<div class="flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-fg-muted">
		<b class="font-semibold text-fg">{item.mine ? t('home.you') : item.actor.name}</b>
		<span>{t('home.stream.wroteIn')}</span>
		<span
			><a href={journalHref} class="font-medium text-fg hover:underline">{item.anchor.name}</a>{t(
				'home.stream.wroteInJournal'
			)}</span
		>
		{#if item.visibility === 'private'}<PrivateMark
				veilId="journal:{item.id}"
				class="text-[11px]"
			/>{/if}
		<StreamWhen time={when} />
	</div>
	<!-- A full-width stream would run a line past 1000 px; ~72 characters
	     keep it readable. -->
	<!-- A private moment's words and photos stay blurred until asked for
	     (docs/02 §2.10.1); one veil id, so a tap shows both. -->
	<Veil
		id="journal:{item.id}"
		isPrivate={item.visibility === 'private'}
		label={t('privacy.veil.moment')}
		text={item.bodyHtml}
		class="mt-1 max-w-[72ch]"
		textClass="text-fg"
	>
		<div class="note-body text-fg">{@html item.bodyHtml}</div>
	</Veil>
	{#if item.photoIds.length}
		<Veil
			id="journal:{item.id}"
			isPrivate={item.visibility === 'private'}
			label={t('privacy.veil.photo')}
			photo
			class="mt-2 w-fit"
		>
			<div class="flex gap-1.5">
				{#each item.photoIds as photoId, index (photoId)}
					<a
						href="/media/{photoId}"
						target="_blank"
						rel="noreferrer"
						class="block overflow-hidden rounded-md border border-border"
					>
						<img
							src="/media/{photoId}?thumb"
							alt={t('components.photo.open', {
								n: index + 1,
								count: item.photoIds.length
							})}
							loading="lazy"
							class="size-16 object-cover"
						/>
					</a>
				{/each}
			</div>
		</Veil>
	{/if}
	<!-- The people a moment mentions are chips in its body already; only an
	     interaction, whose participants the text does not name, lists them. -->
</div>
