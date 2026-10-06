<script lang="ts">
	import type { Snippet } from 'svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { MessageKey } from '$lib/i18n/translate';
	import type { OutboxItem } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import Button from './Button.svelte';
	import Icon from './Icon.svelte';

	/*
	 * Something written while Stella was out of reach and kept on this device (docs/02 §2.18,
	 * docs/05 "Kept moments"): a moment on Home, a note, a call or photos on a person's page, an
	 * entry on their journal page. It looks like the item it will become, inside a dashed
	 * outline, and says where it stands. Until it is on its way it can be edited — `onEdit`
	 * here, or `editHref` on the page that owns it — and discarded, which asks twice because
	 * this device holds the only copy.
	 */

	interface Props {
		item: OutboxItem;
		/** Open it for editing here. */
		onEdit?: () => void;
		/** Or: the page where it is edited. */
		editHref?: string;
		/** What follows the status in the heading line — whom it is about, its day. */
		meta?: Snippet;
		/** The item's own text. */
		children?: Snippet;
	}
	let { item, onEdit, editHref, meta, children }: Props = $props();

	const t = useTranslate();
	let confirming = $state(false);

	const LABEL: Record<OutboxItem['state'], MessageKey> = {
		pending: 'home.outbox.notSent',
		held: 'home.outbox.editing',
		sending: 'home.outbox.sending',
		refused: 'home.outbox.couldNotSend'
	};
	// Once Stella has the moment, only its photos are still on their way.
	const DELIVERED_LABEL: Record<OutboxItem['state'], MessageKey> = {
		pending: 'home.outbox.photosWaiting',
		held: 'home.outbox.photosWaiting',
		sending: 'home.outbox.sendingPhotos',
		refused: 'home.outbox.photoRefused'
	};
	const refused = $derived(item.state === 'refused');
	const editable = $derived(!item.delivered && (onEdit !== undefined || editHref !== undefined));
</script>

<article
	class="grid grid-cols-[32px_1fr] gap-3 rounded-app border border-dashed px-2.5 py-2.5 {refused
		? 'border-danger/60 bg-danger/5'
		: 'border-border'}"
	data-outbox-state={item.state}
>
	<span
		class="grid size-8 place-items-center rounded-full border border-dashed {refused
			? 'border-danger text-danger'
			: 'border-fg-subtle text-fg-subtle'}"
		aria-hidden="true"
	>
		<Icon name="offline" size={14} />
	</span>
	<div class="min-w-0">
		<div class="flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-fg-muted">
			<b class="font-semibold {refused ? 'text-danger' : 'text-fg'}"
				>{t((item.delivered ? DELIVERED_LABEL : LABEL)[item.state])}</b
			>
			{#if item.photos.length}<span
					class="inline-flex items-center gap-1 text-[11px] text-fg-subtle"
					><Icon name="photo" size={11} />{t('home.outbox.photoCount', {
						count: item.photos.length
					})}</span
				>{/if}
			{#if 'visibility' in item.command.payload && item.command.payload.visibility === 'private'}<span
					class="inline-flex items-center gap-1 text-[11px] text-fg-subtle"
					title={t('common.onlyYouSee')}
					><Icon name="private" size={11} />{t('common.privateInline')}</span
				>{/if}
			{@render meta?.()}
		</div>
		{@render children?.()}
		{#if item.reason}<p class="mt-1 text-sm text-danger">{item.reason}</p>{/if}
		{#if item.state === 'pending' || item.state === 'refused'}
			<div class="mt-1.5 flex flex-wrap gap-1.5">
				{#if confirming}
					<span class="self-center text-xs text-fg-muted">{t('home.outbox.discardQuestion')}</span>
					<Button
						variant="danger"
						size="sm"
						onclick={() => {
							confirming = false;
							void outbox.discard(item.command.id);
						}}>{t('home.outbox.discardConfirm')}</Button
					>
					<Button variant="ghost" size="sm" onclick={() => (confirming = false)}
						>{t('common.cancel')}</Button
					>
				{:else}
					{#if editable}
						<Button variant="secondary" size="sm" icon="write" href={editHref} onclick={onEdit}
							>{t('home.outbox.edit')}</Button
						>
					{/if}
					<Button variant="ghost" size="sm" icon="remove" onclick={() => (confirming = true)}
						>{t('home.outbox.discard')}</Button
					>
				{/if}
			</div>
		{/if}
	</div>
</article>
