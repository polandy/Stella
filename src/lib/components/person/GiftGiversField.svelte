<script lang="ts">
	import PersonSearchSelect from '#lib/components/people/PersonSearchSelect.svelte';
	import { givenFromWho, HOUSEHOLD_GIVER } from '#lib/gifts/gifts.js';
	import type { GiverSuggestion } from '#lib/gifts/giver-suggestions.js';
	import { useI18n } from '#lib/i18n/context.svelte.js';
	import type { SelectablePerson } from '#lib/people/select.js';

	/*
	 * *Von* (docs/dev/02 §2.25.12): a search for the people who give it, as many as give it
	 * together, kept as chips with a × while the search stays open for the next. The household's own
	 * suggestions — *Wir*, the person's links, the household's people — are simply the first entries
	 * of the list, so nobody is pushed at the field before they look. Every chip posts a `giver`
	 * of its own; the server reads the first as the giver and the rest beside them.
	 */
	interface Props {
		/** The chosen givers: a person's id, or `HOUSEHOLD_GIVER` for *Wir*. Bind this. */
		values?: string[];
		/** The field each chip posts as. */
		name?: string;
		label: string;
		/** The person's links, then the household, as `giverSuggestions` ordered them. */
		ties: readonly GiverSuggestion[];
		household: readonly GiverSuggestion[];
		/** Everyone the search may find. */
		people: SelectablePerson[];
		/** The one person the search leaves out: whoever the gift is for. */
		recipientId: string;
		/** Own person of the viewer: alone as the giver, the line reads *From me*. */
		selfContactId?: string | null;
		/** Quiet by default: a line saying *From us* until someone opens it (a given gift's *Von*). */
		optional?: boolean;
		/** Called with each giver just added. */
		onchange?: (value: string) => void;
	}
	let {
		values = $bindable([]),
		name = 'giver',
		label,
		ties,
		household,
		people,
		recipientId,
		selfContactId = null,
		optional = false,
		onchange
	}: Props = $props();

	const t = useI18n().t;
	const searchId = $props.id();
	let changing = $state(false);
	const open = $derived(!optional || changing);

	const who = $derived(givenFromWho(values, selfContactId));
	const names = $derived(
		values
			.map((id) => options.find((person) => person.id === id)?.displayName)
			.filter((name) => name !== undefined)
			.join(', ')
	);
	function reset() {
		values = [];
		changing = false;
	}

	/** *Wir* is no person, but the picker lists and chips it like one. */
	const us = $derived<SelectablePerson>({
		id: HOUSEHOLD_GIVER,
		displayName: t('gifts.giver.we'),
		firstName: null,
		lastName: null,
		nickname: null,
		description: null,
		avatarPhotoId: null
	});
	/** *Wir*, then the suggestions in their order, then everyone else: the list's first entries. */
	const options = $derived.by(() => {
		const searchable = people.filter((person) => person.id !== recipientId);
		const byId = new Map(searchable.map((person) => [person.id, person]));
		const first = [...ties, ...household]
			.map((suggestion) => byId.get(suggestion.id))
			.filter((person) => person !== undefined);
		const suggested = new Set(first.map((person) => person.id));
		return [us, ...first, ...searchable.filter((person) => !suggested.has(person.id))];
	});
</script>

<div class="flex flex-col gap-1.5" data-testid="gift-giver">
	{#if optional}
		<div class="flex min-h-9 items-center justify-between gap-2" data-testid="gift-giver-from">
			<span class="text-sm text-fg">
				{who === 'named'
					? t('gifts.giver.line.named', { names })
					: t(who === 'me' ? 'gifts.giver.line.me' : 'gifts.giver.line.us')}
				{#if who === 'us'}
					<span class="ms-1 text-xs text-fg-subtle">{t('gifts.giver.line.default')}</span>
				{/if}
			</span>
			<span class="flex items-center gap-3">
				{#if open && values.length > 0}
					<button type="button" class="text-sm text-primary" onclick={reset}>
						{t('gifts.giver.line.reset')}
					</button>
				{/if}
				<button
					type="button"
					class="text-sm text-primary"
					aria-expanded={open}
					onclick={() => (changing = !changing)}
					data-testid="gift-giver-change"
				>
					{t('gifts.giver.line.change')}
				</button>
			</span>
		</div>
	{/if}
	<div class="flex flex-col gap-1.5" hidden={!open}>
		<label for={searchId} class="text-xs font-medium text-fg-muted">
			{label}{#if optional}<span class="ms-1 font-normal">· {t('gifts.giver.line.optional')}</span
				>{/if}
		</label>
		<PersonSearchSelect
			id={searchId}
			people={options}
			{name}
			multiple
			bind:selectedIds={values}
			onPick={(person) => onchange?.(person.id)}
			allowCreate
			placeholder={values.length > 0 ? t('gifts.giver.searchMore') : t('gifts.giver.find')}
		/>
		{#if values.length > 1}
			<p class="text-xs text-fg-muted" data-testid="gift-giver-together">
				{t('gifts.giver.together')}
			</p>
		{/if}
	</div>
</div>
