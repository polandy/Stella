<script lang="ts">
	import type { SubmitFunction } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Button from '#lib/components/ui/Button.svelte';
	import DateField from '#lib/components/ui/DateField.svelte';
	import FormError from '#lib/components/ui/FormError.svelte';
	import { syncModal } from '#lib/components/ui/modal.js';
	import { dayLabel } from '#lib/dates/labels.js';
	import type { PartialDate } from '#lib/dates/partial-date.js';
	import { enhance } from '#lib/forms/enhance.js';
	import type { GiftOnRecord } from '#lib/gifts/already-given.js';
	import { HOUSEHOLD_GIVER } from '#lib/gifts/gifts.js';
	import type { GiverSuggestion } from '#lib/gifts/giver-suggestions.js';
	import { giverLabel, pastOccasionChip } from '#lib/gifts/labels.js';
	import {
		pastOccasions,
		plannedOn,
		rowCounts,
		tickedAtFirst,
		type PastOccasion,
		type PlannedGift,
		type RecordRow
	} from '#lib/gifts/record-given.js';
	import { useI18n } from '#lib/i18n/context.svelte.js';
	import type { SelectablePerson } from '#lib/people/select.js';
	import { useRemovals } from '#lib/undo/context.svelte.js';
	import GiftRecordRow from './GiftRecordRow.svelte';

	/*
	 * *Record given…* (docs/dev/02 §2.25.14, D9–D12): one passed occasion, what was planned for it
	 * ticked off, and what else was given written down — from a person's card, or for everyone
	 * from `/gifts`. One form, one command per gift on the server.
	 */
	interface Props {
		open: boolean;
		/** The person the card is theirs; null on `/gifts`, where each row names its own. */
		recipient: { id: string; name: string } | null;
		/** The recipient's birth date, for their last birthday; null on `/gifts`. */
		birth: PartialDate | null;
		today: string;
		/** The open and bought gifts the sheet may tick, each with its occasion's day. */
		planned: readonly PlannedGift[];
		/** The day it opens on, when it opened from an occasion; else the latest. */
		start: string | null;
		people: SelectablePerson[];
		ties: readonly GiverSuggestion[];
		household: readonly GiverSuggestion[];
		/** The recipient's gifts, for the *already given* hint. */
		gifts: readonly GiftOnRecord[];
		error: string | null;
	}
	let {
		open = $bindable(),
		recipient,
		birth,
		today,
		planned,
		start,
		people,
		ties,
		household,
		gifts,
		error
	}: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const removals = useRemovals();
	const uid = $props.id();
	const titleId = `${uid}-record-title`;
	let dialog = $state<HTMLDialogElement>();

	const occasions = $derived(pastOccasions({ today, birth, planned }));
	let chosen = $state<PastOccasion | null>(null);
	let otherDay = $state('');
	let ticked = $state<string[]>([]);
	let rows = $state<RecordRow[]>([]);

	const blankRow = (): RecordRow => ({
		title: '',
		forId: recipient?.id ?? '',
		from: HOUSEHOLD_GIVER
	});

	function choose(next: PastOccasion | null) {
		chosen = next;
		ticked = next
			? plannedOn(planned, next.on, birth)
					.filter(tickedAtFirst)
					.map((g) => g.id)
			: [];
	}

	$effect(() => {
		syncModal(dialog, open, () => {
			choose(occasions.find((found) => found.on === start) ?? occasions[0] ?? null);
			otherDay = '';
			rows = [blankRow(), blankRow()];
		});
	});

	const givenOn = $derived(chosen?.on ?? otherDay);
	const listed = $derived(chosen ? plannedOn(planned, chosen.on, birth) : []);
	const count = $derived(
		listed.filter((gift) => ticked.includes(gift.id)).length + rows.filter(rowCounts).length
	);
	const occasionName = $derived(
		chosen ? pastOccasionChip(i18n, chosen).title : otherDay ? dayLabel(i18n, otherDay) : ''
	);

	function toggle(giftId: string) {
		ticked = ticked.includes(giftId) ? ticked.filter((id) => id !== giftId) : [...ticked, giftId];
	}

	// The toast's words are read at submit, before the reload changes what the sheet holds.
	const submit: SubmitFunction = () => {
		const done = t('gifts.record.done', { count, occasion: occasionName });
		return async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'redirect' || result.type === 'success') {
				removals.notify(done);
				open = false;
			} else if (result.type === 'failure' && result.data?.recorded) {
				// Some went in before one was refused: the page shows them now.
				await invalidateAll();
			}
		};
	};

	const CHIP =
		'rounded-full border border-border bg-bg px-3 py-1 text-[0.8125rem] text-fg-muted aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:font-medium aria-pressed:text-primary';
	const LABEL = 'mt-4 mb-1.5 text-xs font-semibold tracking-wide text-fg-subtle uppercase';
</script>

<dialog
	bind:this={dialog}
	aria-labelledby={titleId}
	onclose={() => (open = false)}
	onclick={(event) => event.target === event.currentTarget && dialog?.close()}
	class="mx-auto mt-auto mb-0 w-full max-w-lg rounded-t-app border border-border bg-card p-0 text-fg shadow-pop backdrop:bg-bg-sunken/70 backdrop:backdrop-blur-sm md:m-auto md:rounded-app"
	data-testid="gift-record-sheet"
>
	{#if open}
		<form
			method="POST"
			action="?/recordGifts"
			use:enhance={submit}
			class="flex max-h-[88vh] flex-col"
		>
			<header class="flex items-start gap-1 px-4 pt-4">
				<div class="min-w-0 flex-1">
					<h2 id={titleId} class="text-lg font-semibold break-words">
						{recipient
							? t('gifts.record.titleFor', { name: recipient.name })
							: t('gifts.record.title')}
					</h2>
					<p class="text-sm text-fg-muted">{t('gifts.record.intro')}</p>
				</div>
				<Button
					variant="ghost"
					size="sm"
					type="button"
					icon="remove"
					label={t('common.close')}
					onclick={() => (open = false)}
				/>
			</header>

			<div class="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
				<FormError message={error} variant="inline" />

				<h3 class={LABEL}>{t('gifts.record.occasion')}</h3>
				<div class="flex flex-wrap gap-1.5" data-testid="gift-record-occasions">
					{#each occasions as occasion (occasion.on)}
						{@const chip = pastOccasionChip(i18n, occasion)}
						<button
							type="button"
							class={CHIP}
							aria-pressed={chosen?.on === occasion.on}
							onclick={() => choose(occasion)}
						>
							{chip.title} <span class="text-fg-subtle">{chip.day}</span>
						</button>
					{/each}
					<button
						type="button"
						class={CHIP}
						aria-pressed={chosen === null}
						onclick={() => choose(null)}>{t('gifts.record.otherDay')}</button
					>
				</div>
				{#if chosen}
					<input type="hidden" name="givenOn" value={chosen.on} />
					<input type="hidden" name="occasion" value={chosen.occasion ?? ''} />
					<p class="mt-1.5 text-xs text-fg-muted">
						{t('gifts.record.on', { day: dayLabel(i18n, chosen.on) })}
					</p>
				{:else}
					<div class="mt-2">
						<DateField
							name="givenOn"
							bind:value={otherDay}
							max={today}
							required
							label={t('gifts.record.day')}
						/>
					</div>
				{/if}

				{#if listed.length > 0}
					<h3 class={LABEL}>{t('gifts.record.planned')}</h3>
					<ul class="flex flex-col divide-y divide-border-subtle" data-testid="gift-record-planned">
						{#each listed as gift (gift.id)}
							{@const giver = giverLabel(t, gift.giver, gift.state)}
							<li>
								<label class="flex cursor-pointer items-center gap-3 py-2">
									<span class="min-w-0 flex-1">
										<span class="block text-sm break-words text-fg">{gift.title}</span>
										<span class="block text-xs text-fg-muted">
											{[
												recipient ? null : t('gifts.record.plannedFor', { name: gift.contactName }),
												giver,
												gift.state === 'bought' ? t('gifts.state.bought') : null
											]
												.filter((part) => part !== null)
												.join(' · ')}
										</span>
									</span>
									<input
										type="checkbox"
										name="planned"
										value="{gift.contactId}/{gift.id}"
										checked={ticked.includes(gift.id)}
										onchange={() => toggle(gift.id)}
										aria-label={t('gifts.record.wasGiven', { title: gift.title })}
										class="size-5 shrink-0 accent-[var(--primary)]"
									/>
								</label>
							</li>
						{/each}
					</ul>
				{/if}

				<h3 class={LABEL}>
					{listed.length > 0 ? t('gifts.record.also') : t('gifts.record.what')}
				</h3>
				<input type="hidden" name="rows" value={rows.length} />
				<ul class="flex flex-col">
					{#each rows as _, index (index)}
						<GiftRecordRow
							{index}
							bind:row={rows[index]}
							{recipient}
							{people}
							{ties}
							{household}
							{gifts}
						/>
					{/each}
				</ul>
				<Button
					variant="ghost"
					size="sm"
					type="button"
					icon="add"
					onclick={() => (rows = [...rows, blankRow()])}
				>
					{t('gifts.record.addRow')}
				</Button>
			</div>

			<footer class="flex justify-end gap-2 border-t border-border-subtle px-4 py-3">
				<Button variant="secondary" size="sm" type="button" onclick={() => (open = false)}>
					{t('common.cancel')}
				</Button>
				<Button variant="primary" size="sm" disabled={count === 0 || givenOn === ''}>
					{t('gifts.record.save', { count })}
				</Button>
			</footer>
		</form>
	{/if}
</dialog>
