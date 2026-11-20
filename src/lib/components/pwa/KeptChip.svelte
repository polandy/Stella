<script lang="ts">
	import { useTranslate } from '#lib/i18n/context.svelte.js';
	import type { MessageKey } from '#lib/i18n/translate.js';
	import { recallable, type OutboxItem } from '#lib/pwa/outbox.js';
	import { outbox } from '#lib/pwa/outbox.svelte.js';
	import Icon from '../ui/Icon.svelte';

	/*
	 * A tag or circle added while Stella was out of reach, kept on this device (docs/dev/02 §2.18):
	 * the chip it will become, in a dashed outline, beside the real ones. A single word is
	 * quicker typed again than edited, so it offers only *Discard*, and without asking twice —
	 * what is lost is the word on the chip. A refused or stuck one turns to `--danger` and says why.
	 */

	interface Props {
		item: OutboxItem;
		label: string;
	}
	let { item, label }: Props = $props();

	const t = useTranslate();
	const STATUS: Record<OutboxItem['state'], MessageKey> = {
		pending: 'home.outbox.notSent',
		held: 'home.outbox.editing',
		sending: 'home.outbox.sending',
		refused: 'home.outbox.couldNotSend',
		stuck: 'home.outbox.stuck'
	};
	const refused = $derived(item.state === 'refused' || item.state === 'stuck');
</script>

<li
	class="inline-flex max-w-full items-center gap-1.5 rounded-full border border-dashed py-1 pr-1.5 pl-2.5 text-sm {refused
		? 'border-danger text-danger'
		: 'border-fg-subtle text-fg-muted'}"
	title={item.reason ?? t(STATUS[item.state])}
	data-outbox-state={item.state}
>
	<Icon name="offline" size={12} />
	<span class="truncate">{label}</span>
	<span class="sr-only">— {item.reason ?? t(STATUS[item.state])}</span>
	{#if recallable(item)}
		<!-- 24px square (WCAG 2.5.8); the negative margin keeps the chip its own height. -->
		<button
			type="button"
			class="-my-1 grid size-6 shrink-0 place-items-center rounded-full hover:bg-bg-sunken"
			aria-label={t('home.outbox.discardNamed', { name: label })}
			onclick={() => void outbox.discard(item.command.id)}
		>
			<Icon name="remove" size={11} />
		</button>
	{/if}
</li>
