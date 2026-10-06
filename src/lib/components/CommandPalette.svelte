<script lang="ts">
	import FormerlyMark from '$lib/components/FormerlyMark.svelte';
	import FoundByJobMark from '$lib/components/FoundByJobMark.svelte';
	import JobLine from '$lib/components/JobLine.svelte';
	import { goto } from '$app/navigation';
	import Avatar from '$lib/components/Avatar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import NamesakeLine from '$lib/components/NamesakeLine.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { paletteRows, type PalettePerson } from '$lib/palette/palette';
	import { usePeopleContext } from '$lib/people/context.svelte';
	import { tick } from 'svelte';

	/*
	 * ⌘K (docs/05 §5.4). A native <dialog> so focus trapping, Escape and the backdrop come
	 * from the platform; the rows come from the pure `paletteRows`, this only draws and
	 * navigates. Arrow keys move, Enter follows, and the list resets on every open so a stale
	 * query from last time never greets the next keystroke.
	 */

	interface Props {
		people: PalettePerson[];
		open: boolean;
	}
	let { people, open = $bindable() }: Props = $props();

	let dialog: HTMLDialogElement | undefined = $state();
	let input: HTMLInputElement | undefined = $state();
	let query = $state('');
	let selected = $state(0);

	const t = useTranslate();
	const peopleContext = usePeopleContext();
	const rows = $derived(
		paletteRows(
			query,
			people,
			{
				write: t('components.palette.write'),
				addPerson: t('components.palette.addPerson'),
				searchEverything: (q) => t('components.palette.searchEverything', { query: q })
			},
			peopleContext()
		)
	);

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) {
			query = '';
			selected = 0;
			dialog.showModal();
			void tick().then(() => input?.focus());
		} else if (!open && dialog.open) {
			dialog.close();
		}
	});

	// Keep the highlight on a real row when the query shrinks the list under it.
	$effect(() => {
		if (selected >= rows.length) selected = Math.max(0, rows.length - 1);
	});

	function follow(href: string) {
		open = false;
		void goto(href);
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			selected = (selected + 1) % Math.max(1, rows.length);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			selected = (selected - 1 + rows.length) % Math.max(1, rows.length);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			const row = rows[selected];
			if (row) follow(row.href);
		}
	}
</script>

<dialog
	bind:this={dialog}
	onclose={() => (open = false)}
	onclick={(e) => e.target === dialog && (open = false)}
	aria-label={t('components.palette.jumpTo')}
	class="m-0 w-full max-w-lg self-start justify-self-center rounded-app border border-border bg-card p-0 text-fg shadow-pop backdrop:bg-bg-sunken/70 backdrop:backdrop-blur-sm max-sm:max-w-none max-sm:rounded-b-none sm:mt-[12vh]"
>
	<div class="flex items-center gap-2.5 border-b border-border-subtle px-3.5 py-3">
		<Icon name="search" size={16} />
		<input
			bind:this={input}
			bind:value={query}
			oninput={() => (selected = 0)}
			onkeydown={onKeydown}
			type="text"
			role="combobox"
			aria-expanded={rows.length > 0}
			aria-autocomplete="list"
			placeholder={t('components.palette.placeholder')}
			aria-label={t('components.palette.jumpTo')}
			aria-controls="palette-rows"
			aria-activedescendant={rows[selected]
				? `palette-${rows[selected].kind}-${rows[selected].id}`
				: undefined}
			autocomplete="off"
			class="min-w-0 flex-1 bg-transparent text-[15px] text-fg placeholder:text-fg-subtle focus-visible:outline-none"
		/>
		<kbd class="rounded border border-border px-1.5 text-[10px] font-medium text-fg-subtle">esc</kbd
		>
	</div>
	<ul id="palette-rows" role="listbox" class="max-h-[60vh] overflow-y-auto p-1.5">
		{#each rows as row, i (row.kind + row.id)}
			<!-- The link itself is the option: an option may not hold an interactive child. -->
			<li role="none">
				<a
					id="palette-{row.kind}-{row.id}"
					role="option"
					aria-selected={i === selected}
					href={row.href}
					onclick={(e) => {
						e.preventDefault();
						follow(row.href);
					}}
					onpointerenter={() => (selected = i)}
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
					{#if row.kind !== 'person'}<span class="ml-auto text-xs text-fg-subtle"
							>{row.kind === 'search'
								? t('components.palette.kindSearch')
								: t('components.palette.kindAction')}</span
						>{/if}
				</a>
			</li>
		{:else}
			<li role="presentation" class="px-2.5 py-4 text-center text-sm text-fg-muted">
				{t('components.palette.empty')}
			</li>
		{/each}
	</ul>
</dialog>
