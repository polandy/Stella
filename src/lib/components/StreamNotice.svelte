<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import StreamWhen from '$lib/components/StreamWhen.svelte';
	import type { StreamTime } from '$lib/stream/days';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { NoticeContent } from '$lib/stream/notices';

	/*
	 * A line of Home's stream that the activity log holds (docs/02 §2.11). A removal is shown as
	 * written — nobody is left to link to. Last names given and a name edited are stored as facts
	 * and said here, in the reader's language; a renamed person the reader can see is a link.
	 */
	let {
		content,
		who,
		time,
		canOpen
	}: {
		content: NoticeContent;
		who: string;
		/** When it happened, as the stream says it. */
		time: StreamTime;
		/** Whether the reader may open this person — someone they can see. */
		canOpen: (contactId: string) => boolean;
	} = $props();

	const t = useTranslate();
	const icon = $derived(content.kind === 'text' ? 'remove' : 'rename');
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
