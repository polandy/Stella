<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import Combobox from '$lib/components/Combobox.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import LastNameSelectionBar from './LastNameSelectionBar.svelte';
	import type { SurnamePersonView } from './types';

	/*
	 * *No suggestion* (docs/concepts/surnames.md §3.1): a field per person, offering the
	 * surnames the household already uses. *Select…* ticks several of them and opens the same
	 * bar as the People directory, so five cousins with no link at all still get one name in
	 * one step.
	 */
	let {
		people,
		knownSurnames,
		hidden,
		disabled,
		offlineLine,
		held
	}: {
		people: SurnamePersonView[];
		knownSurnames: readonly string[];
		hidden: ReadonlySet<string>;
		disabled: boolean;
		offlineLine: string | null;
		held: SubmitFunction;
	} = $props();

	const t = useTranslate();
	const shown = $derived(people.filter((p) => !hidden.has(p.id)));
	let selecting = $state(false);
	let selected = $state<Record<string, boolean>>({});
	let drafts = $state<Record<string, string>>({});
	const chosen = $derived(
		shown.filter((p) => selected[p.id]).map((p) => ({ ...p, lastName: null }))
	);
	const everyoneChosen = $derived(shown.length > 0 && chosen.length === shown.length);

	function toggleEveryone() {
		const next = !everyoneChosen;
		selected = Object.fromEntries(shown.map((p) => [p.id, next]));
	}
</script>

{#if shown.length > 0}
	<section
		class="flex flex-col gap-2 rounded-app bg-card p-3 shadow-card"
		data-testid="last-name-fields"
		class:pb-24={selecting}
	>
		<header class="flex items-center gap-3">
			<h2 class="min-w-0 flex-1 text-lg font-semibold text-fg">
				{t('surnames.noSuggestion')}
				<span class="text-sm font-normal text-fg-subtle tabular-nums">· {shown.length}</span>
			</h2>
			<Button
				size="sm"
				type="button"
				aria-pressed={selecting}
				onclick={() => ((selecting = !selecting), (selected = {}))}
			>
				{selecting ? t('common.cancel') : t('surnames.select')}
			</Button>
		</header>
		<ul class="flex flex-col gap-1">
			{#each shown as person (person.id)}
				<li class="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1 py-1.5">
					{#if selecting}
						<input
							type="checkbox"
							class="size-5"
							aria-label={t('surnames.choose', { name: person.displayName })}
							bind:checked={selected[person.id]}
						/>
					{/if}
					<Avatar
						id={person.id}
						name={person.displayName}
						avatarPhotoId={person.avatarPhotoId}
						size={32}
					/>
					<a
						href="/contacts/{person.id}"
						class="min-w-0 flex-1 truncate font-medium text-fg hover:underline"
					>
						{person.displayName}{#if person.isDeceased}<span
								class="text-xs font-normal text-fg-subtle"
							>
								· {t('surnames.deceased')}</span
							>{/if}
					</a>
					{#if !selecting}
						<form
							method="POST"
							action="?/setLastNames"
							use:enhance={held}
							class="flex w-full gap-2 sm:w-auto"
						>
							<input type="hidden" name="contactId" value={person.id} />
							<Combobox
								name="lastName"
								bind:value={drafts[person.id]}
								options={knownSurnames}
								placeholder={t('surnames.lastNamePlaceholder')}
								class="min-w-0 flex-1 rounded-md border border-border-input bg-bg px-3 py-1.5 text-sm text-fg sm:w-44"
							/>
							<Button size="sm" disabled={disabled || !(drafts[person.id] ?? '').trim()}
								>{t('common.save')}</Button
							>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
	{#if selecting}
		<LastNameSelectionBar
			{chosen}
			{everyoneChosen}
			{knownSurnames}
			{held}
			{disabled}
			{offlineLine}
			ontoggleeveryone={toggleEveryone}
			ondone={() => ((selecting = false), (selected = {}))}
		/>
	{/if}
{/if}
