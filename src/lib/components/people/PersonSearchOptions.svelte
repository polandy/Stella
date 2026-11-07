<script lang="ts">
	import FormerlyMark from '$lib/components/people/FormerlyMark.svelte';
	import FoundByJobMark from '$lib/components/people/FoundByJobMark.svelte';
	import JobLine from '$lib/components/people/JobLine.svelte';
	import NamesakeLine from '$lib/components/people/NamesakeLine.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { foundByFormerName } from '$lib/people/former-name';
	import { foundByJob } from '$lib/people/job';
	import type { Distinction } from '$lib/people/namesakes';
	import type { SelectablePerson } from '$lib/people/select';

	/*
	 * What the person picker's search found, and under it the offer to add somebody new. The
	 * search field keeps focus throughout and points at a row with aria-activedescendant, so
	 * every row is a `tabindex="-1"` option and a press lands on `mousedown`, before the blur.
	 */

	interface Props {
		listboxId: string;
		optionId: (i: number) => string;
		createOptionId: string;
		matches: readonly SelectablePerson[];
		query: string;
		namesakes: ReadonlyMap<string, Distinction>;
		/** The row the arrow keys are on; the create row is the one after the last person. */
		highlighted: number;
		showCreate: boolean;
		/** Whether to offer taking every match at once. */
		offerAll: boolean;
		onchoose: (person: SelectablePerson) => void;
		onchooseall: () => void;
		onstartcreate: () => void;
	}
	let {
		listboxId,
		optionId,
		createOptionId,
		matches,
		query,
		namesakes,
		highlighted = $bindable(),
		showCreate,
		offerAll,
		onchoose,
		onchooseall,
		onstartcreate
	}: Props = $props();

	const t = useTranslate();
	const createIndex = $derived(matches.length);
</script>

{#if offerAll}
	<div
		class="flex items-center justify-between gap-2 border-b border-border px-2.5 py-1.5 text-xs text-fg-muted"
	>
		<span>{t('components.personSearch.matches', { count: matches.length })}</span>
		<button
			type="button"
			data-testid="person-search-add-all"
			onmousedown={(e) => {
				e.preventDefault();
				onchooseall();
			}}
			class="rounded-control px-2 py-1 font-medium text-primary hover:bg-primary-soft"
		>
			{t('components.personSearch.addAll', { count: matches.length })}
		</button>
	</div>
{/if}
<!--
	One listbox holding the people and, under them, the offer to add somebody new: the
	field points at either with aria-activedescendant, so both have to be its options.
	The people scroll on their own list (`person-search-listbox`), presentational to a
	screen reader, so the offer stays in view below however many match.
-->
<div id={listboxId} role="listbox">
	<ul role="none" data-testid="person-search-listbox" class="max-h-56 overflow-y-auto p-1">
		{#if matches.length === 0}
			<!-- Not an option: a note that there are none, for the eye and for a reader alike. -->
			<li role="presentation" class="px-2.5 py-1.5 text-sm text-fg-muted">
				{t('components.personSearch.empty')}
			</li>
		{:else}
			{#each matches as person, i (person.id)}
				{@const namesakeLine = namesakes.get(person.id)}
				<li role="none">
					<button
						type="button"
						role="option"
						id={optionId(i)}
						tabindex="-1"
						aria-selected={i === highlighted}
						onmousedown={(e) => {
							e.preventDefault();
							onchoose(person);
						}}
						onmouseenter={() => (highlighted = i)}
						class="flex w-full items-center gap-2.5 rounded-control px-2.5 py-1.5 text-left text-sm text-fg aria-selected:bg-primary-soft"
					>
						<Avatar
							id={person.id}
							name={person.displayName}
							avatarPhotoId={person.avatarPhotoId}
							size={22}
						/>
						<span class="min-w-0">
							<span class="block truncate"
								>{person.displayName}<FormerlyMark
									name={foundByFormerName(person, query)}
								/><FoundByJobMark found={foundByJob(person, query)} /></span
							>
							{#if namesakeLine}<NamesakeLine distinction={namesakeLine} />{/if}
							<JobLine job={person} small />
						</span>
					</button>
				</li>
			{/each}
		{/if}
	</ul>

	{#if showCreate}
		<button
			type="button"
			role="option"
			id={createOptionId}
			tabindex="-1"
			aria-selected={highlighted === createIndex}
			data-testid="person-search-create-option"
			onmousedown={(e) => {
				e.preventDefault();
				onstartcreate();
			}}
			onmouseenter={() => (highlighted = createIndex)}
			class="flex w-full items-start gap-2.5 border-t border-border p-2.5 text-left text-sm text-fg {highlighted ===
			createIndex
				? 'bg-primary-soft'
				: ''}"
		>
			<span
				class="mt-px grid size-[22px] shrink-0 place-items-center rounded-full bg-primary-soft text-primary"
			>
				<Icon name="add" size={13} />
			</span>
			<!-- Wraps rather than truncates: the name is the whole point of the row. -->
			<span class="min-w-0 leading-snug">
				{t('components.personSearch.create', { name: query.trim() })}
			</span>
		</button>
	{/if}
</div>
