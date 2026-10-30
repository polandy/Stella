<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import DateField from '$lib/components/ui/DateField.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import GiftOccasionField from '$lib/components/person/GiftOccasionField.svelte';
	import GiftStateMark from '$lib/components/person/GiftStateMark.svelte';
	import type { NextOccasion } from '$lib/gifts/idea-list';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { reveal } from '$lib/motion/motion.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { heldAnswer } from '$lib/undo/held-answer';
	import { removalKey } from '$lib/undo/keys';
	import { tick } from 'svelte';

	/*
	 * One open idea on the household's list (docs/02 §2.25.6): what it is, its note, who noted
	 * it — and *Mark as given*, asking only for the day and the occasion, with the occasion the
	 * group is for already chosen. The answer is held for one undo window before it is sent
	 * (`heldAnswer`), so a mis-tap costs nothing; until then the row is hidden.
	 */
	interface Props {
		idea: {
			id: string;
			contactId: string;
			title: string;
			note: string | null;
			url: string | null;
			visibility: 'shared' | 'private';
			mine: boolean;
			notedBy: string | null;
		};
		/** The occasion the person's group is for; the form starts on it. */
		next: NextOccasion;
		/** The day *Mark as given* starts on. */
		today: string;
		/** The refusal of this row's last save, if any — without JavaScript only. */
		error: string | null;
		/** The answer went out, so the row stays hidden until the list is read again. */
		onSending: (giftId: string) => void;
		onSettled: (giftId: string, sent: boolean) => void;
	}
	let { idea, next, today, error, onSending, onSettled }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const removals = useRemovals();

	// A refusal (without JavaScript, the page came back) leaves the form open with its reason.
	// svelte-ignore state_referenced_locally
	let giving = $state(error !== null);
	let row = $state<HTMLElement>();

	async function open() {
		giving = true;
		await tick();
		row?.querySelector<HTMLElement>('form input:not([type="hidden"])')?.focus();
	}
	function close() {
		giving = false;
		void tick().then(() => row?.querySelector<HTMLElement>('[data-give-open]')?.focus());
	}

	const held = $derived(
		heldAnswer(
			{ holder: removals, fetch: (url, init) => window.fetch(url, init) },
			{
				key: removalKey('gift', idea.id),
				label: t('gifts.markGiven.title', { title: idea.title }),
				onSending: () => onSending(idea.id),
				onCommitted: () => onSettled(idea.id, true),
				onFailed: () => onSettled(idea.id, false)
			}
		)
	);
</script>

<li bind:this={row} class="flex gap-3 border-t border-border-subtle py-2.5 first:border-t-0">
	<GiftStateMark state="idea" />
	<div class="min-w-0 flex-1">
		<p class="font-medium break-words text-fg">{idea.title}</p>
		{#if idea.note}
			<p class="text-sm whitespace-pre-line text-fg-muted">{idea.note}</p>
		{/if}
		<p class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-fg-subtle">
			<span
				>{idea.mine
					? t('gifts.notedByYou')
					: t('gifts.notedBy', { name: idea.notedBy ?? '…' })}</span
			>
			{#if idea.url}
				<span aria-hidden="true">·</span>
				<a
					href={idea.url}
					target="_blank"
					rel="noreferrer noopener"
					class="inline-flex items-center gap-1 text-link hover:underline"
					aria-label={t('gifts.openLink', { title: idea.title })}
				>
					<Icon name="link" size={11} />{t('gifts.link')}
				</a>
			{/if}
			{#if idea.visibility === 'private'}
				<span aria-hidden="true">·</span>
				<span class="inline-flex items-center gap-1" title={t('common.onlyYouSee')}>
					<Icon name="private" size={11} />{t('common.privateInline')}
				</span>
			{/if}
		</p>

		{#if giving}
			<form
				method="POST"
				action="?/markGiftGiven"
				use:enhance={(input) => {
					giving = false;
					return held(input);
				}}
				transition:reveal
				class="mt-3 flex flex-col gap-3 rounded-control bg-bg-sunken p-3"
				data-testid="mark-given"
			>
				<h3 class="text-sm font-semibold text-fg">
					{t('gifts.markGiven.title', { title: idea.title })}
				</h3>
				<input type="hidden" name="giftId" value={idea.id} />
				<input type="hidden" name="contactId" value={idea.contactId} />
				<div class="flex flex-col gap-1">
					<span class="text-xs font-medium text-fg-muted">{t('gifts.form.on')}</span>
					<DateField name="givenOn" required value={today} label={t('gifts.form.on')} />
				</div>
				<GiftOccasionField occasion={next.kind} />
				<FormError message={error} variant="inline" />
				<div class="flex justify-end gap-2">
					<Button variant="ghost" size="sm" type="button" onclick={close}>
						{t('common.cancel')}
					</Button>
					<Button variant="primary" size="sm">{t('gifts.markGiven')}</Button>
				</div>
			</form>
		{:else}
			<!-- Outlined, not filled: one per idea, so a list of them must not shout. -->
			<Button
				variant="secondary"
				size="sm"
				type="button"
				class="mt-2"
				data-give-open
				onclick={open}
			>
				{t('gifts.markGiven.open')}
			</Button>
		{/if}
	</div>
</li>
