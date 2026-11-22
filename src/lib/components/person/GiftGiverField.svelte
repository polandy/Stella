<script lang="ts">
	import PersonSearchSelect from '#lib/components/people/PersonSearchSelect.svelte';
	import { HOUSEHOLD_GIVER } from '#lib/gifts/gifts.js';
	import type { GiverSuggestion } from '#lib/gifts/giver-suggestions.js';
	import { useI18n } from '#lib/i18n/context.svelte.js';
	import type { SelectablePerson } from '#lib/people/select.js';

	/*
	 * *Wer schenkt?* (docs/dev/02 §2.25.12): the person's own links, *Wir*, then the household's
	 * people as chips, and a search for anyone else that can name someone new. The chips are one
	 * radio group posting `giver`, so the form works without JavaScript; whoever the search finds
	 * joins them as a chip of their own. A chip pressed again lets go, unless `required`.
	 */
	interface Props {
		/** The posted choice: a person's id, `HOUSEHOLD_GIVER`, or empty for nobody. */
		value?: string;
		/** The field the choice posts as; one per row where a form holds several. */
		name?: string;
		label: string;
		/** The person's links, then the household, as `giverSuggestions` ordered them. */
		ties: readonly GiverSuggestion[];
		household: readonly GiverSuggestion[];
		/** Everyone the search may find. */
		people: SelectablePerson[];
		/** The one person the search leaves out: whoever the gift is for, or whoever gives it. */
		recipientId: string;
		/** A choice is needed: a pressed chip stays pressed. */
		required?: boolean;
		/** Offer *Us*; off where the field picks a recipient, not a giver. */
		withHousehold?: boolean;
		onchange?: (value: string) => void;
	}
	let {
		value = $bindable(''),
		name = 'giver',
		label,
		ties,
		household,
		people,
		recipientId,
		required = false,
		withHousehold = true,
		onchange
	}: Props = $props();

	const t = useI18n().t;
	const searchId = $props.id();

	/** Someone found by the search, shown as a chip beside the suggested ones. */
	let found = $state<GiverSuggestion[]>([]);
	let picked = $state<string[]>([]);
	const searchable = $derived(people.filter((person) => person.id !== recipientId));
	const suggested = $derived(new Set([...ties, ...household].map((person) => person.id)));
	const chips = $derived([
		...ties,
		...found.filter((person) => !suggested.has(person.id)),
		...(withHousehold ? [{ id: HOUSEHOLD_GIVER, name: t('gifts.giver.we'), hint: null }] : []),
		...household
	]);
	// A giver already set but suggested nowhere — on an edit — still shows as theirs.
	const known = $derived(chips.some((chip) => chip.id === value) || value === '');

	function choose(next: string) {
		value = next;
		onchange?.(next);
	}

	/* The click comes before the radio's own change, so `value` still says the earlier choice. */
	function toggle(id: string) {
		if (value === id && !required) choose('');
	}

	function pick(person: SelectablePerson) {
		if (!found.some((known) => known.id === person.id)) {
			found = [...found, { id: person.id, name: person.displayName, hint: null }];
		}
		picked = [];
		choose(person.id);
	}
</script>

<fieldset class="flex flex-col gap-1.5" data-testid="gift-giver">
	<legend class="mb-1.5 text-xs font-medium text-fg-muted">{label}</legend>
	<div class="flex flex-wrap gap-1.5">
		{#each chips as chip (chip.id)}
			<label
				class="cursor-pointer rounded-full border border-border bg-bg px-3 py-1 text-[0.8125rem] text-fg-muted transition-colors has-checked:border-primary has-checked:bg-primary-soft has-checked:font-medium has-checked:text-primary has-focus-visible:outline-2 has-focus-visible:outline-focus-ring"
			>
				<input
					type="radio"
					{name}
					value={chip.id}
					checked={value === chip.id}
					onclick={() => toggle(chip.id)}
					onchange={() => choose(chip.id)}
					class="sr-only"
				/>
				{chip.name}{#if chip.hint}<span class="text-fg-subtle"> · {chip.hint}</span>{/if}
			</label>
		{/each}
		{#if !known}<input type="hidden" {name} {value} />{/if}
	</div>
	<label for={searchId} class="sr-only">{t('gifts.giver.search')}</label>
	<PersonSearchSelect
		id={searchId}
		people={searchable}
		name="{name}Search"
		bind:selectedIds={picked}
		onPick={pick}
		allowCreate
		placeholder={t('gifts.giver.search')}
	/>
</fieldset>
