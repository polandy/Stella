<script lang="ts">
	import { goto } from '$app/navigation';
	import Avatar from '$lib/components/Avatar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import NamesakeLine from '$lib/components/NamesakeLine.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { personSearchRows, type PalettePerson } from '$lib/palette/palette';
	import { usePeopleContext } from '$lib/people/context.svelte';

	/*
	 * The home screen's search field (docs/02 §2.22.1, docs/05 §5.4): people matching the
	 * typed name, straight under the field, then a way into full search. It matches against the
	 * people the shell already carries, so it answers as you type and keeps working while
	 * Stella is out of reach. The rows come from the pure `personSearchRows`; this only draws
	 * them and follows one.
	 *
	 * Without JavaScript it is a plain GET form into /search, which is also where Enter goes
	 * when nothing is highlighted and nobody matches.
	 */

	interface Props {
		people: PalettePerson[];
	}
	let { people }: Props = $props();

	/** Long enough for a click on a row to land before the blur closes the list under it. */
	const BLUR_CLOSE_MS = 120;
	const LISTBOX_ID = 'person-finder-rows';

	const t = useTranslate();
	const peopleContext = usePeopleContext();

	let query = $state('');
	let open = $state(false);
	let highlighted = $state(0);
	let root: HTMLFormElement | undefined = $state();

	const rows = $derived(
		personSearchRows(query, people, (q) => t('components.palette.searchEverything', { query: q }), peopleContext())
	);
	const showList = $derived(open && rows.length > 0);

	function follow(href: string) {
		open = false;
		query = '';
		void goto(href);
	}

	function onKeydown(event: KeyboardEvent) {
		// Home and End stay with the text cursor; only the arrows move through the rows.
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			if (rows.length === 0) return;
			event.preventDefault();
			open = true;
			const step = event.key === 'ArrowDown' ? 1 : -1;
			highlighted = (highlighted + step + rows.length) % rows.length;
		} else if (event.key === 'Enter') {
			const row = rows[highlighted];
			if (!row) return; // nothing typed: let the form do nothing useful on its own
			event.preventDefault();
			follow(row.href);
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

<form bind:this={root} method="GET" action="/search" role="search" class="relative" data-testid="person-finder">
	<label class="flex items-center gap-2.5 rounded-app bg-card px-3 py-2.5 text-fg-subtle shadow-card transition-shadow focus-within:text-fg focus-within:ring-2 focus-within:ring-primary/40">
		<Icon name="search" size={16} />
		<input
			name="q"
			type="search"
			role="combobox"
			bind:value={query}
			oninput={() => {
				open = true;
				highlighted = 0;
			}}
			onfocus={() => (open = true)}
			onblur={() => setTimeout(closeIfFocusLeft, BLUR_CLOSE_MS)}
			onkeydown={onKeydown}
			placeholder={t('home.findPerson')}
			aria-label={t('home.findPerson')}
			aria-expanded={showList}
			aria-controls={LISTBOX_ID}
			aria-autocomplete="list"
			aria-activedescendant={showList && rows[highlighted] ? `person-finder-${rows[highlighted].kind}-${rows[highlighted].id}` : undefined}
			autocomplete="off"
			enterkeyhint="search"
			class="min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-fg-subtle"
		/>
	</label>

	{#if showList}
		<ul id={LISTBOX_ID} role="listbox" class="absolute inset-x-0 top-full z-20 mt-1 max-h-[60vh] overflow-y-auto rounded-app border border-border bg-card p-1.5 shadow-pop">
			{#each rows as row, i (row.kind + row.id)}
				<li id="person-finder-{row.kind}-{row.id}" role="option" aria-selected={i === highlighted} class="rounded-control aria-selected:bg-primary-soft">
					<a
						href={row.href}
						onmousedown={(e) => e.preventDefault()}
						onclick={(e) => {
							e.preventDefault();
							follow(row.href);
						}}
						onpointerenter={() => (highlighted = i)}
						tabindex="-1"
						class="flex items-center gap-2.5 px-2.5 py-2 text-sm text-fg"
					>
						{#if row.kind === 'person'}
							<Avatar id={row.id} name={row.label} avatarPhotoId={row.avatarPhotoId} size={24} />
						{:else}
							<span class="grid size-6 place-items-center text-fg-subtle"><Icon name={row.icon} size={15} /></span>
						{/if}
						{#if row.kind === 'person' && row.distinction}
							<span class="min-w-0">
								<span class="block truncate">{row.label}</span>
								<NamesakeLine distinction={row.distinction} />
							</span>
						{:else}
							<span class="truncate">{row.label}</span>
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
