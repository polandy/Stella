<script lang="ts">
	import { tick } from 'svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import DateField from '$lib/components/DateField.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import KnowThemBy from '$lib/components/KnowThemBy.svelte';
	import NamesakeLine from '$lib/components/NamesakeLine.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { usePeopleContext } from '$lib/people/context.svelte';
	import { useDefaultVisibility } from '$lib/people/default-visibility.svelte';
	import { tellApart } from '$lib/people/namesakes';
	import {
		isKnownByMoreThanAFirstName,
		isNameWorthCreating,
		splitTypedName,
		wantsSomethingToKnowThemBy
	} from '$lib/people/new-person';
	import { filterPeople, queryAfterPick, stillNeedsAPick, type SelectablePerson } from '$lib/people/select';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { BLUR_CLOSE_MS } from '$lib/components/blur-close';

	/*
	 * A person picker that filters by name as you type, for any form field where someone chooses
	 * one or more people from a list too long to scan (docs/02 — search wherever a person is
	 * selected). Posts the same hidden `name` field(s) a plain `<select>` would, so it drops into
	 * an existing form action without changing what the server reads.
	 *
	 * With `allowCreate`, a search that finds no one is not a dead end: the typed name becomes a
	 * create option, and the person is named right here rather than on the quick-add page
	 * (docs/02 §2.2.2). The create panel is plain inputs, never a nested `<form>` — this
	 * component sits inside one.
	 */

	/** Where the inline create panel posts; the endpoint answers with the created person. */
	const QUICK_ADD_ENDPOINT = '/contacts/quick-add';


	const VISIBILITY_LEVELS = ['shared', 'private'] as const;
	type Visibility = (typeof VISIBILITY_LEVELS)[number];

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
		id,
		required = false,
		placeholder,
		class: className = ''
	}: Props = $props();

	const t = useTranslate();
	const removals = useRemovals();

	let query = $state('');
	let open = $state(false);
	let highlighted = $state(0);
	let input: HTMLInputElement | undefined = $state();
	let root: HTMLDivElement | undefined = $state();

	/** People named through this picker: the `people` prop is whatever the last load carried. */
	let addedHere = $state<SelectablePerson[]>([]);

	let creating = $state(false);
	let saving = $state(false);
	let createError = $state<string | null>(null);
	let firstNameInput: HTMLInputElement | undefined = $state();
	const defaultVisibility = useDefaultVisibility();
	let draft = $state({
		firstName: '',
		lastName: '',
		nickname: '',
		description: '',
		birthDate: '',
		visibility: defaultVisibility() as Visibility
	});

	const knownPeople = $derived([...people, ...addedHere]);
	const byId = $derived(new Map(knownPeople.map((p) => [p.id, p])));
	/** Which Thomas is which, over everyone offered — a namesake out of sight is still one. */
	const peopleContext = usePeopleContext();
	const namesakes = $derived(tellApart(knownPeople, peopleContext()));
	const askForSomethingToKnowThemBy = $derived(wantsSomethingToKnowThemBy(draft));
	const chosen = $derived(selectedIds.map((pid) => byId.get(pid)).filter((p) => p !== undefined));
	const pickable = $derived(
		multiple ? knownPeople.filter((p) => !selectedIds.includes(p.id)) : knownPeople
	);
	const matches = $derived(open ? filterPeople(query, pickable) : []);
	const showCreate = $derived(open && allowCreate && isNameWorthCreating(query));
	/** The keyboard's world: the people, then the create row when it is offered. */
	const optionCount = $derived(matches.length + (showCreate ? 1 : 0));
	const createIndex = $derived(matches.length);

	/*
	 * The search list closes when the input loses focus, but the create panel has to survive
	 * that — the caret moves into it. So while it is open, a pointer landing anywhere outside
	 * this picker is what closes it.
	 */
	$effect(() => {
		if (!creating) return;
		const closeOnOutside = (event: PointerEvent) => {
			if (root?.contains(event.target as Node)) return;
			creating = false;
			open = false;
		};
		document.addEventListener('pointerdown', closeOnOutside, true);
		return () => document.removeEventListener('pointerdown', closeOnOutside, true);
	});

	function choose(person: SelectablePerson) {
		selectedIds = multiple ? [...selectedIds, person.id] : [person.id];
		onPick?.(person);
		query = queryAfterPick(query, multiple && keepSearch);
		highlighted = 0;
		open = multiple;
		if (!multiple) input?.blur();
	}

	/** Everyone the search lists, at once — a whole family found by one surname. */
	function chooseAll() {
		const everyone = matches;
		selectedIds = [...selectedIds, ...everyone.map((p) => p.id)];
		for (const person of everyone) onPick?.(person);
		query = queryAfterPick(query, keepSearch);
		highlighted = 0;
		input?.focus();
	}

	function remove(pid: string) {
		selectedIds = selectedIds.filter((id) => id !== pid);
	}

	async function startCreate() {
		const { firstName, lastName } = splitTypedName(query);
		draft = { firstName, lastName, nickname: '', description: suggestedDescription, birthDate: '', visibility: defaultVisibility() };
		offered = suggestedDescription;
		createError = null;
		creating = true;
		open = true;
		await tick();
		firstNameInput?.focus();
	}

	// The suggestion follows the form while nobody has made the description their own: another
	// type chosen with the panel open is a new suggestion, a typed description stays.
	let offered = '';
	$effect(() => {
		const next = suggestedDescription;
		if (!creating || next === offered) return;
		if (draft.description === offered) draft.description = next;
		offered = next;
	});

	function cancelCreate() {
		creating = false;
		createError = null;
		input?.focus();
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

	async function submitCreate() {
		// Stella refuses a first name alone (docs/02 §2.2.3); Enter must not get past the button.
		if (saving || !isKnownByMoreThanAFirstName(draft)) return;
		saving = true;
		createError = null;
		try {
			const response = await fetch(QUICK_ADD_ENDPOINT, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(draft)
			});
			if (!response.ok) {
				createError = await failureText(response);
				return;
			}
			const person: SelectablePerson = await response.json();
			addedHere = [...addedHere, person];
			creating = false;
			choose(person);
			removals.notify(t('components.personSearch.created', { name: person.displayName }));
		} catch {
			createError = t('errors.contact.couldNotCreate');
		} finally {
			saving = false;
		}
	}

	/** SvelteKit's `error()` answers JSON `{ message }`; anything else is not ours to parse. */
	async function failureText(response: Response): Promise<string> {
		try {
			const body = await response.json();
			if (typeof body?.message === 'string') return body.message;
		} catch {
			// Fall through to the generic message below.
		}
		return t('errors.contact.couldNotCreate');
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

	/** Enter inside the create panel saves the person; it must never submit the form around us. */
	function onCreateKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			submitCreate();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelCreate();
		}
	}

	const singlePicked = $derived(!multiple ? chosen[0] : undefined);
	const panelClass =
		'absolute left-0 top-full z-10 mt-1 w-full min-w-[16rem] rounded-app border border-border bg-card shadow-pop';
</script>

<div class="relative" bind:this={root}>
	{#each selectedIds as pid (pid)}
		<input type="hidden" {name} value={pid} />
	{/each}

	<div
		class="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-bg px-2 py-1.5 focus-within:ring-2 focus-within:ring-primary {className}"
	>
		{#if multiple}
			{#each chosen as person (person.id)}
				<span class="inline-flex items-center gap-1 rounded-full bg-bg-sunken py-0.5 pl-2 pr-1 text-sm text-fg">
					<Avatar id={person.id} name={person.displayName} avatarPhotoId={person.avatarPhotoId} size={16} />
					{person.displayName}
					<button
						type="button"
						onclick={() => remove(person.id)}
						aria-label={t('components.personSearch.remove', { name: person.displayName })}
						class="grid size-4 place-items-center rounded-full text-fg-subtle hover:bg-bg hover:text-fg"
					>
						<Icon name="remove" size={12} />
					</button>
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
				aria-expanded={open}
				aria-controls="{id}-listbox"
				aria-autocomplete="list"
				autocomplete="off"
				required={stillNeedsAPick(required, selectedIds.length)}
				value={query || singlePicked?.displayName || ''}
				placeholder={singlePicked ? '' : (placeholder ?? t('components.personSearch.placeholder'))}
				oninput={(e) => {
					query = e.currentTarget.value;
					open = true;
					highlighted = 0;
					if (!multiple) selectedIds = [];
				}}
				onfocus={() => (open = true)}
				onkeydown={onKeydown}
				onblur={() => setTimeout(closeIfFocusLeft, BLUR_CLOSE_MS)}
				class="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none"
			/>
		</div>
	</div>

	{#if open && creating}
		<!-- Plain inputs, not a nested form: this picker lives inside the form it feeds. -->
		<div class={panelClass} data-testid="person-search-create">
			<div class="flex flex-col gap-2.5 p-3" onkeydown={onCreateKeydown} role="none">
				<p class="text-sm font-semibold text-fg">{t('components.personSearch.createTitle')}</p>

				<div class="grid grid-cols-2 gap-2">
					<label class="flex flex-col gap-1 text-xs text-fg-muted">
						{t('components.personSearch.firstName')}
						<input
							bind:this={firstNameInput}
							bind:value={draft.firstName}
							type="text"
							autocomplete="off"
							class="rounded-control border border-border bg-bg px-2 py-1.5 text-sm text-fg outline-none focus:ring-2 focus:ring-primary"
						/>
					</label>
					<label class="flex flex-col gap-1 text-xs text-fg-muted">
						{t('components.personSearch.lastName')}
						<input
							bind:value={draft.lastName}
							type="text"
							autocomplete="off"
							class="rounded-control border border-border bg-bg px-2 py-1.5 text-sm text-fg outline-none focus:ring-2 focus:ring-primary"
						/>
					</label>
				</div>

				{#if askForSomethingToKnowThemBy}
					<KnowThemBy
						firstName={draft.firstName}
						compact
						label={t('components.personSearch.description')}
						bind:value={draft.description}
						inputClass="rounded-control border border-border bg-card px-2 py-1.5 text-sm text-fg outline-none focus:ring-2 focus:ring-primary"
					/>
				{:else}
					<!-- Worth asking for anyone new, not only a first name alone: it is what they are found by. -->
					<label class="flex flex-col gap-1 text-xs text-fg-muted">
						{t('components.personSearch.description')}
						<input
							bind:value={draft.description}
							type="text"
							autocomplete="off"
							placeholder={t('components.namesake.placeholder')}
							class="rounded-control border border-border bg-bg px-2 py-1.5 text-sm text-fg outline-none focus:ring-2 focus:ring-primary"
						/>
					</label>
				{/if}

				<details class="text-xs text-fg-muted">
					<summary class="cursor-pointer">{t('components.personSearch.more')}</summary>
					<div class="mt-2 grid grid-cols-2 gap-2">
						<label class="flex flex-col gap-1">
							{t('components.personSearch.nickname')}
							<input
								bind:value={draft.nickname}
								type="text"
								autocomplete="off"
								class="rounded-control border border-border bg-bg px-2 py-1.5 text-sm text-fg outline-none focus:ring-2 focus:ring-primary"
							/>
						</label>
						<div class="col-span-2 flex flex-col gap-1">
							{t('components.personSearch.birthDate')}
							<DateField
								bind:value={draft.birthDate}
								label={t('components.personSearch.birthDate')}
								allowYearUnknown
							/>
						</div>
					</div>
				</details>

				<fieldset class="flex items-center gap-2">
					<legend class="sr-only">{t('components.personSearch.visibility')}</legend>
					{#each VISIBILITY_LEVELS as level (level)}
						<button
							type="button"
							aria-pressed={draft.visibility === level}
							onclick={() => (draft.visibility = level)}
							class="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-fg-muted aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:text-fg"
						>
							<Icon name={level} size={12} />
							{t(`components.personSearch.${level}`)}
						</button>
					{/each}
				</fieldset>

				{#if createError}
					<p class="text-xs text-danger" role="alert">{createError}</p>
				{/if}

				<div class="flex justify-end gap-2">
					<!-- `type="button"`: these sit inside the caller's form and must never submit it. -->
					<Button type="button" variant="ghost" size="sm" onclick={cancelCreate}>
						{t('components.personSearch.cancel')}
					</Button>
					<Button
						type="button"
						variant="primary"
						size="sm"
						disabled={saving || !isKnownByMoreThanAFirstName(draft)}
						onclick={submitCreate}
					>
						{saving ? t('components.personSearch.submitting') : t('components.personSearch.submit')}
					</Button>
				</div>
			</div>
		</div>
	{:else if open}
		<div class={panelClass}>
			{#if multiple && query.trim() !== '' && matches.length > 1}
				<div class="flex items-center justify-between gap-2 border-b border-border px-2.5 py-1.5 text-xs text-fg-muted">
					<span>{t('components.personSearch.matches', { count: matches.length })}</span>
					<button
						type="button"
						data-testid="person-search-add-all"
						onmousedown={(e) => {
							e.preventDefault();
							chooseAll();
						}}
						class="rounded-control px-2 py-1 font-medium text-primary hover:bg-primary-soft"
					>
						{t('components.personSearch.addAll', { count: matches.length })}
					</button>
				</div>
			{/if}
			<ul
				id="{id}-listbox"
				role="listbox"
				data-testid="person-search-listbox"
				class="max-h-56 overflow-y-auto p-1"
			>
				{#if matches.length === 0}
					<li class="px-2.5 py-1.5 text-sm text-fg-subtle">{t('components.personSearch.empty')}</li>
				{:else}
					{#each matches as person, i (person.id)}
						{@const namesakeLine = namesakes.get(person.id)}
						<li role="none">
							<button
								type="button"
								role="option"
								aria-selected={i === highlighted}
								onmousedown={(e) => {
									e.preventDefault();
									choose(person);
								}}
								onmouseenter={() => (highlighted = i)}
								class="flex w-full items-center gap-2.5 rounded-control px-2.5 py-1.5 text-left text-sm text-fg aria-selected:bg-primary-soft"
							>
								<Avatar id={person.id} name={person.displayName} avatarPhotoId={person.avatarPhotoId} size={22} />
								<span class="min-w-0">
									<span class="block truncate">{person.displayName}</span>
									{#if namesakeLine}<NamesakeLine distinction={namesakeLine} />{/if}
								</span>
							</button>
						</li>
					{/each}
				{/if}
			</ul>

			<!--
				An action, not an option: it sits outside the listbox so that "the options" stays a
				list of people — for a screen reader as much as for a test locating someone by name.
			-->
			{#if showCreate}
				<button
					type="button"
					data-testid="person-search-create-option"
					onmousedown={(e) => {
						e.preventDefault();
						startCreate();
					}}
					onmouseenter={() => (highlighted = createIndex)}
					class="flex w-full items-start gap-2.5 border-t border-border p-2.5 text-left text-sm text-fg {highlighted ===
					createIndex
						? 'bg-primary-soft'
						: ''}"
				>
					<span class="mt-px grid size-[22px] shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
						<Icon name="add" size={13} />
					</span>
					<!-- Wraps rather than truncates: the name is the whole point of the row. -->
					<span class="min-w-0 leading-snug">
						{t('components.personSearch.create', { name: query.trim() })}
					</span>
				</button>
			{/if}
		</div>
	{/if}
</div>
