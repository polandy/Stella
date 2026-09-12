<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { filterPeople, type SelectablePerson } from '$lib/people/select';

	/*
	 * A person picker that filters by name as you type, for any form field where someone chooses
	 * one or more people from a list too long to scan (docs/02 — search wherever a person is
	 * selected). Posts the same hidden `name` field(s) a plain `<select>` would, so it drops into
	 * an existing form action without changing what the server reads.
	 */

	interface Props {
		people: SelectablePerson[];
		name: string;
		/** Chosen person ids. Bind this; the component only appends to or replaces it. */
		selectedIds?: string[];
		/** Multiple people, kept as removable chips, vs. one that replaces the current pick. */
		multiple?: boolean;
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
		id,
		required = false,
		placeholder,
		class: className = ''
	}: Props = $props();

	const t = useTranslate();

	let query = $state('');
	let open = $state(false);
	let highlighted = $state(0);
	let input: HTMLInputElement | undefined = $state();

	const byId = $derived(new Map(people.map((p) => [p.id, p])));
	const chosen = $derived(selectedIds.map((pid) => byId.get(pid)).filter((p) => p !== undefined));
	const pickable = $derived(multiple ? people.filter((p) => !selectedIds.includes(p.id)) : people);
	const matches = $derived(open ? filterPeople(query, pickable) : []);

	function choose(person: SelectablePerson) {
		selectedIds = multiple ? [...selectedIds, person.id] : [person.id];
		query = '';
		highlighted = 0;
		open = multiple;
		if (!multiple) input?.blur();
	}

	function remove(pid: string) {
		selectedIds = selectedIds.filter((id) => id !== pid);
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Backspace' && query === '' && multiple && selectedIds.length > 0) {
			remove(selectedIds[selectedIds.length - 1]);
			return;
		}
		if (!open || matches.length === 0) return;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			highlighted = (highlighted + 1) % matches.length;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			highlighted = (highlighted - 1 + matches.length) % matches.length;
		} else if (event.key === 'Enter') {
			event.preventDefault();
			choose(matches[highlighted]);
		} else if (event.key === 'Escape') {
			open = false;
		}
	}

	const singlePicked = $derived(!multiple ? chosen[0] : undefined);
</script>

<div class="relative">
	{#each selectedIds as pid (pid)}
		<input type="hidden" {name} value={pid} />
	{/each}

	<div
		class="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-bg px-2 py-1.5 focus-within:ring-2 focus-within:ring-primary {className}"
	>
		{#if multiple}
			{#each chosen as person (person.id)}
				<span class="inline-flex items-center gap-1 rounded-full bg-bg-sunken py-0.5 pl-2 pr-1 text-sm text-fg">
					<Avatar id={person.id} name={person.displayName} size={16} />
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
				{required}
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
				onblur={() => setTimeout(() => (open = false), 120)}
				class="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none"
			/>
		</div>
	</div>

	{#if open}
		<ul
			id="{id}-listbox"
			role="listbox"
			data-testid="person-search-listbox"
			class="absolute left-0 top-full z-10 mt-1 max-h-56 w-full min-w-[16rem] overflow-y-auto rounded-app border border-border bg-card p-1 shadow-pop"
		>
			{#if matches.length === 0}
				<li class="px-2.5 py-1.5 text-sm text-fg-subtle">{t('components.personSearch.empty')}</li>
			{:else}
				{#each matches as person, i (person.id)}
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
							<Avatar id={person.id} name={person.displayName} size={22} />
							<span class="truncate">{person.displayName}</span>
						</button>
					</li>
				{/each}
			{/if}
		</ul>
	{/if}
</div>
