<script lang="ts">
	import { FIELD_FRAME } from '$lib/components/ui/field';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import PersonQuickAdd from '$lib/components/people/PersonQuickAdd.svelte';
	import PersonSearchOptions from '$lib/components/people/PersonSearchOptions.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { usePeopleContext } from '$lib/people/context.svelte';
	import { tellApart } from '$lib/people/namesakes';
	import { isNameWorthCreating } from '$lib/people/new-person';
	import {
		filterPeople,
		queryAfterPick,
		stillNeedsAPick,
		type SelectablePerson
	} from '$lib/people/select';
	import { watchPlacement } from '$lib/people/panel-placement.svelte';
	import type { PanelPlacement } from '$lib/people/panel-placement';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { BLUR_CLOSE_MS } from '$lib/components/ui/blur-close';

	/*
	 * A person picker that filters by name as you type, for any form field where someone chooses
	 * one or more people from a list too long to scan (docs/02 — search wherever a person is
	 * selected). Posts the same hidden `name` field(s) a plain `<select>` would, so it drops into
	 * an existing form action without changing what the server reads.
	 *
	 * With `allowCreate`, a search that finds no one is not a dead end: the typed name becomes a
	 * create option, and the person is named right here rather than on the quick-add page
	 * (docs/02 §2.2.2, `PersonQuickAdd`).
	 */

	interface Props {
		people: SelectablePerson[];
		name: string;
		/** Chosen person ids. Bind this; the component only appends to or replaces it. */
		selectedIds?: string[];
		/** Multiple people, kept as removable chips, vs. one that replaces the current pick. */
		multiple?: boolean;
		/**
		 * With `multiple`: leave the typed search in place after a pick, so a surname keeps
		 * listing the rest of the family. Off, each pick empties the box.
		 */
		keepSearch?: boolean;
		/** Offer creating a person from the typed name, for pickers where a stranger belongs. */
		allowCreate?: boolean;
		/**
		 * What to fill the new person's description with, from what the form around the picker
		 * already says about them — "Child of Hans Meyer" in a relationship form (docs/02 §2.2.3).
		 */
		suggestedDescription?: string;
		/** Called with the person a pick lands on, for a form that reads more off them than the id. */
		onPick?: (person: SelectablePerson) => void;
		/** Called with someone the create panel just made, before the pick lands on them. */
		onCreate?: (person: SelectablePerson) => void;
		/**
		 * With `multiple`: the most people the field takes, or null for no limit. At the limit the
		 * search closes and says `fullPlaceholder`; chips beyond it stay, for the form to explain.
		 */
		max?: number | null;
		/** With `multiple`: the fewest chips the field keeps; that many have no ×. */
		min?: number;
		/** What the closed search says once `max` is reached. */
		fullPlaceholder?: string;
		/** Chips to mark as refused — the form says why under the field (docs/02 §2.4). */
		markedIds?: readonly string[];
		/** Read out on a marked chip, after the name. */
		markedLabel?: string;
		/** The hints under the field, for the search to be described by. */
		describedBy?: string;
		id?: string;
		required?: boolean;
		placeholder?: string;
		class?: string;
	}
	let {
		people,
		name,
		selectedIds = $bindable([]),
		multiple = false,
		keepSearch = false,
		allowCreate = false,
		suggestedDescription = '',
		onPick,
		onCreate,
		max = null,
		min = 0,
		fullPlaceholder,
		markedIds = [],
		markedLabel = '',
		describedBy,
		id,
		required = false,
		placeholder,
		class: className = ''
	}: Props = $props();

	const t = useTranslate();
	const removals = useRemovals();
	// A picker without an `id` of its own still needs one to tie its list to its field.
	const uid = $props.id();
	const baseId = $derived(id ?? uid);
	const listboxId = $derived(`${baseId}-listbox`);
	const optionId = (i: number) => `${baseId}-option-${i}`;
	const createOptionId = $derived(`${baseId}-create`);

	let query = $state('');
	let open = $state(false);
	let highlighted = $state(0);
	let input: HTMLInputElement | undefined = $state();
	let root: HTMLDivElement | undefined = $state();

	/** People named through this picker: the `people` prop is whatever the last load carried. */
	let addedHere = $state<SelectablePerson[]>([]);
	let creating = $state(false);

	const knownPeople = $derived([...people, ...addedHere]);
	const byId = $derived(new Map(knownPeople.map((p) => [p.id, p])));
	/** Which Thomas is which, over everyone offered — a namesake out of sight is still one. */
	const peopleContext = usePeopleContext();
	const namesakes = $derived(tellApart(knownPeople, peopleContext()));
	const chosen = $derived(selectedIds.map((pid) => byId.get(pid)).filter((p) => p !== undefined));
	const full = $derived(multiple && max !== null && selectedIds.length >= max);
	const pickable = $derived(
		multiple ? knownPeople.filter((p) => !selectedIds.includes(p.id)) : knownPeople
	);
	const matches = $derived(open ? filterPeople(query, pickable) : []);
	const showCreate = $derived(open && allowCreate && isNameWorthCreating(query));
	/** The keyboard's world: the people, then the create row when it is offered. */
	const optionCount = $derived(matches.length + (showCreate ? 1 : 0));
	const createIndex = $derived(matches.length);
	const offerAll = $derived(
		multiple &&
			query.trim() !== '' &&
			matches.length > 1 &&
			(max === null || selectedIds.length + matches.length <= max)
	);

	/*
	 * The search list closes when the input loses focus, but the create panel has to survive
	 * that — the caret moves into it. So a pointer landing anywhere outside this picker is
	 * what closes it, below.
	 */

	let placement = $state<PanelPlacement>({ side: 'below', maxHeight: 224 });

	// A tap beside the picker closes the list and keeps the picks; the list follows the field.
	$effect(() => {
		if (!open || !root) return;
		const field = root;
		const closeOnOutside = (event: PointerEvent) => {
			if (field.contains(event.target as Node)) return;
			creating = false;
			open = false;
		};
		document.addEventListener('pointerdown', closeOnOutside, true);
		const stop = watchPlacement(field, (next) => {
			if (next) placement = next;
			else open = false;
		});
		return () => {
			document.removeEventListener('pointerdown', closeOnOutside, true);
			stop();
		};
	});

	/** Whether the picks just made reached `max`; read straight off the ids, ahead of `full`. */
	const atCap = () => multiple && max !== null && selectedIds.length >= max;

	function choose(person: SelectablePerson) {
		selectedIds = multiple ? [...selectedIds, person.id] : [person.id];
		onPick?.(person);
		// At the cap the search closes; a kept search would stand in it, greyed out, saying nothing.
		query = atCap() ? '' : queryAfterPick(query, multiple && keepSearch);
		highlighted = 0;
		// A kept search stays listed; otherwise open only where it covers nothing below the field.
		open = multiple && (keepSearch || placement.side === 'above');
		if (!multiple) input?.blur();
	}

	/** Everyone the search lists, at once — a whole family found by one surname. */
	function chooseAll() {
		const everyone = matches;
		selectedIds = [...selectedIds, ...everyone.map((p) => p.id)];
		for (const person of everyone) onPick?.(person);
		query = atCap() ? '' : queryAfterPick(query, keepSearch);
		highlighted = 0;
		input?.focus();
	}

	function remove(pid: string) {
		if (selectedIds.length <= min) return;
		selectedIds = selectedIds.filter((id) => id !== pid);
	}

	function startCreate() {
		creating = true;
		open = true;
	}

	function cancelCreate() {
		creating = false;
		input?.focus();
	}

	function created(person: SelectablePerson) {
		addedHere = [...addedHere, person];
		creating = false;
		onCreate?.(person);
		choose(person);
		// The name typed was this person's; kept, it would offer creating them a second time.
		query = '';
		open = false;
		removals.notify(t('components.personSearch.created', { name: person.displayName }));
	}

	/*
	 * Closing on blur has to survive the focus coming straight back. Cancelling the create panel
	 * does exactly that — the click blurs the input, then hands it the caret again — and a timer
	 * that only asked "are we still creating?" would shut the list a moment later, under someone
	 * who had just returned to it.
	 */
	function closeIfFocusLeft() {
		if (creating) return;
		if (root?.contains(document.activeElement)) return;
		open = false;
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Backspace' && query === '' && multiple && selectedIds.length > 0) {
			remove(selectedIds[selectedIds.length - 1]);
			return;
		}
		if (!open || optionCount === 0) return;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			highlighted = (highlighted + 1) % optionCount;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			highlighted = (highlighted - 1 + optionCount) % optionCount;
		} else if (event.key === 'Enter') {
			event.preventDefault();
			if (showCreate && highlighted === createIndex) startCreate();
			else choose(matches[highlighted]);
		} else if (event.key === 'Escape') {
			// Consumed, so the form around the picker keeps its own Escape for itself: the
			// section's disclosure closes on Escape (docs/05 §5.7), and dismissing a suggestion
			// list must not throw away the half-filled form behind it.
			event.preventDefault();
			open = false;
		}
	}

	const singlePicked = $derived(!multiple ? chosen[0] : undefined);
	/** The row the arrow keys are on, as the field announces it (`aria-activedescendant`). */
	const activeOption = $derived.by(() => {
		if (!open || creating) return undefined;
		if (showCreate && highlighted === createIndex) return createOptionId;
		return highlighted < matches.length ? optionId(highlighted) : undefined;
	});
	const panelClass = $derived(
		`absolute left-0 z-10 w-full overflow-y-auto ${placement.side === 'above' ? 'bottom-full mb-1' : 'top-full mt-1'} ` +
			'min-w-[16rem] rounded-app border border-border bg-card shadow-pop'
	);
	const panelStyle = $derived(`max-height: ${placement.maxHeight}px`);
</script>

<div class="relative" bind:this={root}>
	{#each selectedIds as pid (pid)}
		<input type="hidden" {name} value={pid} />
	{/each}

	<div class="{FIELD_FRAME} flex flex-wrap items-center gap-1.5 bg-bg px-2 py-1.5 {className}">
		{#if multiple}
			{#each chosen as person (person.id)}
				{@const marked = markedIds.includes(person.id)}
				<span
					class="inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2 text-sm text-fg {marked
						? 'chip-marked'
						: 'bg-bg-sunken'}"
					data-marked={marked || undefined}
					data-testid="person-search-chip"
				>
					<Avatar
						id={person.id}
						name={person.displayName}
						avatarPhotoId={person.avatarPhotoId}
						size={16}
					/>
					<span class={marked ? 'line-through decoration-danger' : ''}>{person.displayName}</span>
					{#if marked && markedLabel}<span class="sr-only">({markedLabel})</span>{/if}
					<!-- 24px square (WCAG 2.5.8); the negative margin keeps the chip its own height. -->
					{#if selectedIds.length > min}
						<button
							type="button"
							onclick={() => remove(person.id)}
							aria-label={t('components.personSearch.remove', { name: person.displayName })}
							class="-my-1 grid size-6 place-items-center rounded-full text-fg-muted hover:bg-bg hover:text-fg"
						>
							<Icon name="remove" size={12} />
						</button>
					{:else}
						<span class="w-1"></span>
					{/if}
				</span>
			{/each}
		{/if}

		<div class="flex min-w-[8rem] flex-1 items-center gap-1.5">
			<Icon name="search" size={14} class="shrink-0 text-fg-subtle" />
			<input
				bind:this={input}
				{id}
				type="text"
				role="combobox"
				aria-expanded={open && !creating}
				aria-controls={listboxId}
				aria-activedescendant={activeOption}
				aria-autocomplete="list"
				aria-describedby={describedBy}
				autocomplete="off"
				disabled={full}
				required={stillNeedsAPick(required, selectedIds.length)}
				value={query || singlePicked?.displayName || ''}
				placeholder={singlePicked
					? ''
					: full
						? (fullPlaceholder ?? '')
						: (placeholder ?? t('components.personSearch.placeholder'))}
				oninput={(e) => {
					query = e.currentTarget.value;
					open = true;
					highlighted = 0;
					if (!multiple) selectedIds = [];
				}}
				onfocus={() => (open = !full)}
				onkeydown={onKeydown}
				onblur={() => setTimeout(closeIfFocusLeft, BLUR_CLOSE_MS)}
				class="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none disabled:placeholder:text-fg-subtle disabled:placeholder:italic"
			/>
		</div>
	</div>

	{#if open && creating}
		<div class={panelClass} style={panelStyle} data-testid="person-search-create">
			<PersonQuickAdd
				typed={query}
				{suggestedDescription}
				oncreated={created}
				oncancel={cancelCreate}
			/>
		</div>
	{:else if open && !full}
		<div
			class={panelClass}
			style={panelStyle}
			data-testid="person-search-panel"
			data-side={placement.side}
		>
			<PersonSearchOptions
				{listboxId}
				{optionId}
				{createOptionId}
				{matches}
				{query}
				{namesakes}
				bind:highlighted
				{showCreate}
				{offerAll}
				onchoose={choose}
				onchooseall={chooseAll}
				onstartcreate={startCreate}
			/>
		</div>
	{/if}
</div>

<style>
	/* A refused person (docs/02 §2.4): tinted and outlined in the danger colour, never removed. */
	.chip-marked {
		background: color-mix(in srgb, var(--danger) 12%, var(--card));
		outline: 1px solid color-mix(in srgb, var(--danger) 55%, transparent);
	}
</style>
