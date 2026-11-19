<script lang="ts">
	import FormerlyMark from '$lib/components/people/FormerlyMark.svelte';
	import FoundByJobMark from '$lib/components/people/FoundByJobMark.svelte';
	import JobLine from '$lib/components/people/JobLine.svelte';
	import { goto } from '$app/navigation';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import NamesakeLine from '$lib/components/ui/NamesakeLine.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { paletteLabels, personFinderRows, type PalettePerson } from '$lib/ui/command-palette';
	import { usePeopleContext } from '$lib/people/context.svelte';
	import { BLUR_CLOSE_MS } from '$lib/components/ui/blur-close';
	import { nextMenuIndex } from '$lib/ui/menu';

	/*
	 * The home screen's search field (docs/dev/02 §2.22.1, docs/dev/05 §5.4): people matching the
	 * typed name, straight under the field, then a way into full search. It matches against the
	 * people the shell already carries, so it answers as you type and keeps working while
	 * Stella is out of reach. Empty and focused, it lists the household's lists instead (Gifts,
	 * To-dos, Outings …), which have no tab. The rows come from the pure `personFinderRows`; this only draws
	 * them and follows one.
	 *
	 * Without JavaScript it is a plain GET form into /search.
	 */

	interface Props {
		people: PalettePerson[];
	}
	let { people }: Props = $props();

	const LISTBOX_ID = 'person-finder-rows';

	const t = useTranslate();
	const peopleContext = usePeopleContext();

	let query = $state('');
	let open = $state(false);
	let highlighted = $state(0);
	// Lists show on an empty field without being aimed at, so Enter there stays put.
	let aimed = $state(false);
	const active = $derived(query.trim() === '' && !aimed ? -1 : highlighted);
	let root: HTMLFormElement | undefined = $state();

	const rows = $derived(personFinderRows(query, people, paletteLabels(t), peopleContext()));
	const showList = $derived(open && rows.length > 0);

	function follow(href: string) {
		open = false;
		query = '';
		aimed = false;
		void goto(href);
	}

	function onKeydown(event: KeyboardEvent) {
		// Home and End stay with the text cursor; only the arrows move through the rows.
		const next = event.key.startsWith('Arrow')
			? nextMenuIndex(active, rows.length, event.key)
			: null;
		if (next !== null) {
			event.preventDefault();
			open = true;
			aimed = true;
			highlighted = next;
		} else if (event.key === 'Enter') {
			// Nothing typed means no rows: stay put rather than open an empty full search.
			event.preventDefault();
			const row = rows[active];
			if (row) follow(row.href);
		} else if (event.key === 'Escape') {
			if (!showList && query === '') return;
			event.preventDefault();
			if (showList) open = false;
			else query = '';
		}
	}

	function closeIfFocusLeft() {
		if (root?.contains(document.activeElement)) return;
		open = false;
	}
</script>

<form
	bind:this={root}
	method="GET"
	action="/search"
	role="search"
	class="relative"
	data-testid="person-finder"
>
	<label
		class="flex items-center gap-2.5 rounded-app bg-card px-3 py-2.5 text-fg-subtle shadow-card transition-shadow focus-within:text-fg focus-within:ring-2 focus-within:ring-primary/40"
	>
		<Icon name="search" size={16} />
		<input
			name="q"
			type="search"
			role="combobox"
			bind:value={query}
			oninput={() => {
				open = true;
				highlighted = 0;
				aimed = false;
			}}
			onfocus={() => {
				open = true;
				aimed = false;
			}}
			onblur={() => setTimeout(closeIfFocusLeft, BLUR_CLOSE_MS)}
			onkeydown={onKeydown}
			placeholder={t('home.findPerson')}
			aria-label={t('home.findPerson')}
			aria-expanded={showList}
			aria-controls={LISTBOX_ID}
			aria-autocomplete="list"
			aria-activedescendant={showList && rows[active]
				? `person-finder-${rows[active].kind}-${rows[active].id}`
				: undefined}
			autocomplete="off"
			enterkeyhint="search"
			class="min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-fg-subtle"
		/>
	</label>

	{#if showList}
		<ul
			id={LISTBOX_ID}
			role="listbox"
			class="absolute inset-x-0 top-full z-20 mt-1 max-h-[60vh] overflow-y-auto rounded-app border border-border bg-card p-1.5 shadow-pop"
		>
			{#each rows as row, i (row.kind + row.id)}
				<!-- The link itself is the option: an option may not hold an interactive child. -->
				<li role="none">
					<a
						id="person-finder-{row.kind}-{row.id}"
						role="option"
						aria-selected={i === active}
						href={row.href}
						onmousedown={(e) => e.preventDefault()}
						onclick={(e) => {
							e.preventDefault();
							follow(row.href);
						}}
						onpointerenter={() => {
							aimed = true;
							highlighted = i;
						}}
						tabindex="-1"
						class="flex items-center gap-2.5 rounded-control px-2.5 py-2 text-sm text-fg aria-selected:bg-primary-soft"
					>
						{#if row.kind === 'person'}
							<Avatar id={row.id} name={row.label} avatarPhotoId={row.avatarPhotoId} size={24} />
						{:else}
							<span class="grid size-6 place-items-center text-fg-subtle"
								><Icon name={row.icon} size={15} /></span
							>
						{/if}
						{#if row.kind === 'person' && (row.distinction || row.job)}
							<span class="min-w-0">
								<span class="block truncate"
									>{row.label}<FormerlyMark name={row.formerly} /><FoundByJobMark
										found={row.foundByJob}
									/></span
								>
								{#if row.distinction}<NamesakeLine distinction={row.distinction} />{/if}
								<JobLine job={row.job} small />
							</span>
						{:else}
							<span class="truncate"
								>{row.label}{#if row.kind === 'person'}<FormerlyMark
										name={row.formerly}
									/><FoundByJobMark found={row.foundByJob} />{/if}</span
							>
						{/if}
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</form>

<style>
	/* The card around the field shows the focus ring; the global :focus-visible outline is
	   unlayered, so a utility cannot take it off the input — a scoped rule can. */
	input:focus-visible {
		outline: none;
	}
</style>
