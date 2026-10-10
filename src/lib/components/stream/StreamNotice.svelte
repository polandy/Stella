<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import StreamWhen from '$lib/components/stream/StreamWhen.svelte';
	import type { StreamTime } from '$lib/stream/days';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { NoticeContent, RemovedRecordKind } from '$lib/stream/notices';

	/*
	 * A line of Home's stream that the activity log holds (docs/02 §2.11). A removal is shown as
	 * written — nobody is left to link to. Last names given, a name edited and a note someone
	 * else removed and a member removed from the household are stored as facts and said here, in
	 * the reader's language; a person the reader can see is a link.
	 */
	let {
		content,
		who,
		time,
		readerId,
		canOpen
	}: {
		content: NoticeContent;
		who: string;
		/** When it happened, as the stream says it. */
		time: StreamTime;
		/** Who reads the stream: a removed note of theirs is "your note". */
		readerId: string;
		/** Whether the reader may open this person — someone they can see. */
		canOpen: (contactId: string) => boolean;
	} = $props();

	const t = useTranslate();
	const icon = $derived(
		content.kind === 'text' || content.kind === 'removed' || content.kind === 'memberRemoved'
			? 'remove'
			: 'rename'
	);

	/** Who removed what of whom, by kind: "removed your note on", "removed Nina’s photo of". */
	function removedLine(kind: RemovedRecordKind, yours: boolean, author: string): string {
		switch (kind) {
			case 'note':
				return yours
					? t('home.stream.removedYourNote')
					: t('home.stream.removedNoteOf', { author });
			case 'journal_entry':
				return yours
					? t('home.stream.removedYourEntry')
					: t('home.stream.removedEntryOf', { author });
			case 'interaction':
				return yours
					? t('home.stream.removedYourTouchpoint')
					: t('home.stream.removedTouchpointOf', { author });
			case 'photo':
			case 'circle_photo':
				return yours
					? t('home.stream.removedYourPhoto')
					: t('home.stream.removedPhotoOf', { author });
		}
	}
</script>

<span
	class="grid size-8 shrink-0 place-items-center rounded-full bg-bg-sunken text-fg-subtle"
	aria-hidden="true"
>
	<Icon name={icon} size={14} />
</span>
<div class="min-w-0">
	<div
		class="flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-fg-muted"
		data-testid="stream-notice"
	>
		<b class="font-semibold text-fg">{who}</b>
		{#if content.kind === 'text'}
			<span class="font-medium text-fg">{content.text}</span>
		{:else if content.kind === 'lastNames'}
			<span class="font-medium text-fg"
				>{t('home.stream.lastNames', { name: content.lastName, count: content.count })}</span
			>
		{:else if content.kind === 'memberRemoved'}
			<span>{t('home.stream.memberRemoved', { name: content.name })}</span>
		{:else if content.kind === 'removed'}
			<span
				>{removedLine(content.recordKind, content.authorId === readerId, content.authorName)}</span
			>
			{#if content.contactId && canOpen(content.contactId)}
				<a href="/contacts/{content.contactId}" class="font-medium text-fg hover:underline"
					>{content.person}</a
				>
			{:else}
				<span class="font-medium text-fg">{content.person}</span>
			{/if}
		{:else if content.from === content.to}
			<span>{t('home.stream.nameEdited')}</span>
			{#if content.contactId && canOpen(content.contactId)}
				<a href="/contacts/{content.contactId}" class="font-medium text-fg hover:underline"
					>{content.to}</a
				>
			{:else}
				<span class="font-medium text-fg">{content.to}</span>
			{/if}
		{:else}
			<span>{t('home.stream.renamed', { from: content.from })}</span>
			{#if content.contactId && canOpen(content.contactId)}
				<a href="/contacts/{content.contactId}" class="font-medium text-fg hover:underline"
					>{content.to}</a
				>
			{:else}
				<span class="font-medium text-fg">{content.to}</span>
			{/if}
			{#if t('home.stream.renamedAfter')}<span>{t('home.stream.renamedAfter')}</span>{/if}
		{/if}
		<StreamWhen {time} />
	</div>
</div>
