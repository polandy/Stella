<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import DateField from '$lib/components/DateField.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { dayLabel } from '$lib/dates/labels';
	import { alreadyGiven, type GiftOnRecord } from '$lib/gifts/already-given';
	import type { GiftState } from '$lib/gifts/gifts';
	import { occasionLabel } from '$lib/gifts/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import GiftOccasionField from './GiftOccasionField.svelte';
	import { INPUT } from './inputs';

	/*
	 * Noting a gift, or rewriting one (docs/02 §2.25). An idea asks only for what it is — the note
	 * and the link fold away until asked for; a given or received gift asks for its day and its
	 * occasion too. Saving needs only the title, and the day where there is one. A title that
	 * looks like a gift already given to them says so underneath — a hint, never a block.
	 */
	interface Props {
		/** What kind of gift this is, which decides whether it has a day. */
		kind: GiftState;
		/** The gift being rewritten; absent while noting a new one. */
		gift?: {
			id: string;
			title: string;
			note: string | null;
			url: string | null;
			givenOn: string | null;
			occasion: string | null;
			visibility: 'shared' | 'private';
		};
		/** The person's gifts, for the *already given* hint. */
		gifts?: readonly GiftOnRecord[];
		/** Names the form: *Idea for Hilde*, *Given to Hilde*. */
		heading: string;
		action: string;
		submit: SubmitFunction;
		/** The day a given or received gift starts on. */
		today: string;
		/** Only the gift's author may make it private, or shared again. */
		canChooseVisibility: boolean;
		/** Where the form shows its own refusal, when the card does not. */
		error?: string | null;
		/** Closes the form; a card's own add form is closed by the card's *Cancel*. */
		onCancel?: () => void;
	}
	let {
		kind,
		gift,
		gifts = [],
		heading,
		action,
		submit,
		today,
		canChooseVisibility,
		error = null,
		onCancel
	}: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	// svelte-ignore state_referenced_locally
	let title = $state(gift?.title ?? '');
	// What was received came from them; only what the household gave can be given twice.
	const twice = $derived(kind === 'received' ? null : alreadyGiven(title, gifts, gift?.id));
	const hintId = $props.id();
	// svelte-ignore state_referenced_locally
	let showMore = $state(Boolean(gift?.note || gift?.url));
	// svelte-ignore state_referenced_locally
	let visibility = $state<'shared' | 'private'>(gift?.visibility ?? 'shared');
</script>

<form
	method="POST"
	{action}
	use:enhance={submit}
	class="flex flex-col gap-3"
	data-testid="gift-form"
>
	<h3 class="text-sm font-semibold text-fg">{heading}</h3>
	{#if gift}
		<input type="hidden" name="giftId" value={gift.id} />
	{:else}
		<input type="hidden" name="state" value={kind} />
	{/if}

	<div class="flex flex-col">
		<label class="flex flex-col gap-1">
			<span class="text-xs font-medium text-fg-muted">{t('gifts.form.what')}</span>
			<input
				name="title"
				required
				bind:value={title}
				aria-describedby={twice ? hintId : undefined}
				placeholder={t('gifts.form.whatPlaceholder')}
				class="{INPUT} w-full"
			/>
		</label>
		<!-- Polite: it may change with every keystroke, and must not cut into the typing. The
		     region stays in place empty, so a reader hears it when it fills. -->
		<span id={hintId} aria-live="polite" class="text-xs text-fg-muted" data-testid="gift-twice">
			{#if twice?.givenOn}
				<span class="mt-1 block">
					<Icon name="gift" size={12} class="mr-0.5 inline align-[-1px] text-[var(--kind-gift)]" />
					{t('gifts.form.alreadyGiven', {
						title: twice.title,
						day: dayLabel(i18n, twice.givenOn),
						occasion: twice.occasion ? occasionLabel(t, twice.occasion) : null
					})}
				</span>
			{/if}
		</span>
	</div>

	{#if kind !== 'idea'}
		<div class="flex flex-col gap-1">
			<span class="text-xs font-medium text-fg-muted">{t('gifts.form.on')}</span>
			<DateField
				name="givenOn"
				required
				value={gift?.givenOn ?? today}
				label={t('gifts.form.on')}
			/>
		</div>
		<GiftOccasionField occasion={gift?.occasion ?? null} />
	{/if}

	{#if showMore}
		<label class="flex flex-col gap-1">
			<span class="text-xs font-medium text-fg-muted">{t('gifts.form.note')}</span>
			<textarea
				name="note"
				rows="2"
				placeholder={t('gifts.form.notePlaceholder')}
				class="{INPUT} w-full">{gift?.note ?? ''}</textarea
			>
		</label>
		<label class="flex flex-col gap-1">
			<span class="text-xs font-medium text-fg-muted">{t('gifts.form.link')}</span>
			<input
				name="url"
				inputmode="url"
				value={gift?.url ?? ''}
				placeholder="https://"
				class="{INPUT} w-full"
			/>
		</label>
	{:else}
		<button
			type="button"
			onclick={() => (showMore = true)}
			class="inline-flex w-fit items-center gap-1 text-sm text-link hover:underline"
		>
			<Icon name="add" size={13} />{t('gifts.form.more')}
		</button>
	{/if}

	<FormError message={error} variant="inline" />

	<div class="flex flex-wrap items-center gap-4 text-sm">
		{#if canChooseVisibility}
			<fieldset class="flex flex-wrap items-center gap-4">
				<legend class="sr-only">{t('common.visibility')}</legend>
				<label class="flex items-center gap-1.5">
					<input type="radio" name="visibility" value="shared" bind:group={visibility} />
					{t('common.shared')}
				</label>
				<label class="flex items-center gap-1.5">
					<input type="radio" name="visibility" value="private" bind:group={visibility} />
					{t('common.private')}
				</label>
			</fieldset>
		{:else}
			<!-- Someone else's gift keeps who may see it: only its author decides that. -->
			<input type="hidden" name="visibility" value={visibility} />
		{/if}
		<span class="ml-auto flex gap-2">
			{#if onCancel}
				<Button variant="ghost" size="sm" type="button" onclick={onCancel}
					>{t('common.cancel')}</Button
				>
			{/if}
			<Button variant="primary" size="sm">{t('common.save')}</Button>
		</span>
	</div>
</form>
