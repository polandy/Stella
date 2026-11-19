<script lang="ts">
	import { enhance } from '#lib/forms/enhance.js';
	import Button from '#lib/components/ui/Button.svelte';
	import FormError from '#lib/components/ui/FormError.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import WhenPicker from '#lib/components/ui/WhenPicker.svelte';
	import type { PartialDate } from '#lib/dates/partial-date.js';
	import { SURPRISE } from '#lib/surprise/surprise.js';
	import { useI18n } from '#lib/i18n/context.svelte.js';
	import { PLAN_QUICK_PICKS, PLAN_WHEN_KINDS } from '#lib/plans/plans.js';
	import type { When } from '#lib/when/when.js';
	import type { SubmitFunction } from '$app/forms';
	import { INPUT } from '../ui/inputs';

	/*
	 * Noting an outing idea, or rewriting one (docs/dev/02 §2.27). It asks for what it is and when;
	 * the note and the link fold away until asked for. Saving needs only the title.
	 */
	interface Props {
		/** The idea being rewritten; absent while noting a new one. */
		plan?: {
			id: string;
			title: string;
			note: string | null;
			url: string | null;
			visibility: 'shared' | 'private';
			hiddenFromPerson: boolean;
			when: When | null;
		};
		heading: string;
		action: string;
		submit: SubmitFunction;
		today: string;
		/** Only the idea's author may change who sees it. */
		canChooseVisibility: boolean;
		/** The person's name when they are a member, who may then be kept from it. */
		person?: string | null;
		/** The person's birth date, which an age is counted from. */
		birth: PartialDate | null;
		/** Where their birth year can be estimated, for an age without one. */
		estimateHref?: string | null;
		/** Where the form shows its own refusal, when the card does not. */
		error?: string | null;
		/** Closes the form; the card's own add form is closed by the card's *Cancel*. */
		onCancel?: () => void;
	}
	let {
		plan,
		heading,
		action,
		submit,
		today,
		canChooseVisibility,
		person = null,
		birth,
		estimateHref = null,
		error = null,
		onCancel
	}: Props = $props();

	const t = useI18n().t;
	// svelte-ignore state_referenced_locally
	let showMore = $state(Boolean(plan?.note || plan?.url));
	// svelte-ignore state_referenced_locally
	let visibility = $state<'shared' | 'private' | typeof SURPRISE>(
		plan?.hiddenFromPerson && person ? SURPRISE : (plan?.visibility ?? 'shared')
	);
</script>

<form
	method="POST"
	{action}
	use:enhance={submit}
	class="flex flex-col gap-3"
	data-testid="plan-form"
>
	<h3 class="text-sm font-semibold text-fg">{heading}</h3>
	{#if plan}<input type="hidden" name="planId" value={plan.id} />{/if}

	<label class="flex flex-col gap-1">
		<span class="text-xs font-medium text-fg-muted">{t('plans.form.what')}</span>
		<input
			name="title"
			required
			value={plan?.title ?? ''}
			placeholder={t('plans.form.whatPlaceholder')}
			class="{INPUT} w-full"
		/>
	</label>

	<WhenPicker
		when={plan?.when ?? null}
		{birth}
		{today}
		{estimateHref}
		kinds={PLAN_WHEN_KINDS}
		nowLabel="anytime"
		picks={PLAN_QUICK_PICKS}
	/>

	{#if showMore}
		<label class="flex flex-col gap-1">
			<span class="text-xs font-medium text-fg-muted">{t('plans.form.note')}</span>
			<textarea
				name="note"
				rows="2"
				placeholder={t('plans.form.notePlaceholder')}
				class="{INPUT} w-full">{plan?.note ?? ''}</textarea
			>
		</label>
		<label class="flex flex-col gap-1">
			<span class="text-xs font-medium text-fg-muted">{t('plans.form.link')}</span>
			<input
				name="url"
				inputmode="url"
				value={plan?.url ?? ''}
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
			<Icon name="add" size={13} />{t('plans.form.more')}
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
				{#if person}
					<label class="flex items-center gap-1.5">
						<input type="radio" name="visibility" value={SURPRISE} bind:group={visibility} />
						{t('plans.everyoneBut', { name: person })}
					</label>
				{/if}
				<label class="flex items-center gap-1.5">
					<input type="radio" name="visibility" value="private" bind:group={visibility} />
					{t('common.private')}
				</label>
			</fieldset>
		{:else}
			<!-- Someone else's idea keeps who may see it: only its author decides that. -->
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
