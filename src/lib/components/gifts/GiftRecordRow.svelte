<script lang="ts">
	import GiftGiverField from '#lib/components/person/GiftGiverField.svelte';
	import PersonSearchSelect from '#lib/components/people/PersonSearchSelect.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { alreadyGiven, type GiftOnRecord } from '#lib/gifts/already-given.js';
	import { HOUSEHOLD_GIVER } from '#lib/gifts/gifts.js';
	import type { GiverSuggestion } from '#lib/gifts/giver-suggestions.js';
	import { occasionLabel } from '#lib/gifts/labels.js';
	import { RECORD_FOR_US, type RecordRow } from '#lib/gifts/record-given.js';
	import { dayLabel } from '#lib/dates/labels.js';
	import { useI18n } from '#lib/i18n/context.svelte.js';
	import type { SelectablePerson } from '#lib/people/select.js';

	/*
	 * One row of *Also given* (docs/dev/02 §2.25.14): *What · For · From*. On a person's card *For*
	 * is them; on `/gifts` it is anyone, or *Us (household)* — then it is received from *From*.
	 */
	interface Props {
		index: number;
		row: RecordRow;
		/** The person the sheet is for, fixed; null on `/gifts`. */
		recipient: { id: string; name: string } | null;
		people: SelectablePerson[];
		ties: readonly GiverSuggestion[];
		household: readonly GiverSuggestion[];
		/** The recipient's gifts, for the *already given* hint; empty where the sheet has none. */
		gifts: readonly GiftOnRecord[];
	}
	let { index, row = $bindable(), recipient, people, ties, household, gifts }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const uid = $props.id();

	// The search's own pick; *Uns* clears it. Rows start without one.
	let pickedFor = $state<string[]>([]);
	const forUs = $derived(row.forId === RECORD_FOR_US);

	function pickFor(person: SelectablePerson) {
		row.forId = person.id;
	}
	function toggleUs() {
		row.forId = forUs ? '' : RECORD_FOR_US;
		pickedFor = [];
	}

	const twice = $derived(
		recipient && row.forId === recipient.id ? alreadyGiven(row.title, gifts) : null
	);
	const needsGiver = $derived(forUs && (row.from === '' || row.from === HOUSEHOLD_GIVER));
	const giverName = $derived(
		[...ties, ...household].find((person) => person.id === row.from)?.name ??
			people.find((person) => person.id === row.from)?.displayName ??
			null
	);
</script>

<li class="flex flex-col gap-2 border-t border-border-subtle py-3" data-testid="gift-record-row">
	<label for="{uid}-title" class="sr-only">{t('gifts.record.whatPlaceholder')}</label>
	<input
		id="{uid}-title"
		name="title-{index}"
		bind:value={row.title}
		placeholder={t('gifts.record.whatPlaceholder')}
		autocomplete="off"
		class="w-full rounded-control border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-focus-ring"
	/>
	{#if twice?.givenOn}
		<p class="text-xs text-fg-muted" data-testid="gift-twice">
			<Icon name="gift" size={12} class="mr-0.5 inline align-[-1px] text-[var(--kind-gift)]" />
			{t('gifts.form.alreadyGiven', {
				title: twice.title,
				day: dayLabel(i18n, twice.givenOn),
				occasion: twice.occasion ? occasionLabel(t, twice.occasion) : null
			})}
		</p>
	{/if}

	<input type="hidden" name="for-{index}" value={row.forId} />
	{#if !recipient}
		<fieldset class="flex flex-col gap-1.5">
			<legend class="mb-1.5 text-xs font-medium text-fg-muted">{t('gifts.record.for')}</legend>
			<div class="flex flex-wrap items-center gap-1.5">
				<button
					type="button"
					aria-pressed={forUs}
					onclick={toggleUs}
					class="rounded-full border border-border bg-bg px-3 py-1 text-[0.8125rem] text-fg-muted aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:font-medium aria-pressed:text-primary"
					data-testid="gift-record-for-us">{t('gifts.record.forUs')}</button
				>
			</div>
			{#if !forUs}
				<label for="{uid}-for" class="sr-only">{t('gifts.record.forSearch')}</label>
				<PersonSearchSelect
					id="{uid}-for"
					{people}
					name="forSearch-{index}"
					bind:selectedIds={pickedFor}
					onPick={pickFor}
					placeholder={t('gifts.record.forSearch')}
				/>
			{/if}
		</fieldset>
	{/if}

	<GiftGiverField
		bind:value={row.from}
		name="from-{index}"
		label={t('gifts.form.from')}
		ties={forUs ? [] : ties}
		{household}
		{people}
		recipientId={forUs ? '' : row.forId}
		required
	/>
	{#if needsGiver}
		<p
			class="rounded-control bg-warning-soft px-2 py-1 text-xs text-fg"
			data-testid="gift-record-need-giver"
		>
			{t('gifts.record.needGiver')}
		</p>
	{:else if forUs && giverName}
		<p class="text-xs text-fg-muted">{t('gifts.record.becomesReceived', { name: giverName })}</p>
	{/if}
</li>
