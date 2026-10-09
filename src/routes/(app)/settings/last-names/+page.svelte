<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import LastNameChoices from '$lib/components/surnames/LastNameChoices.svelte';
	import LastNameFields from '$lib/components/surnames/LastNameFields.svelte';
	import LastNameGroup from '$lib/components/surnames/LastNameGroup.svelte';
	import NamesakeHints from '$lib/components/surnames/NamesakeHints.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { reachability } from '$lib/pwa/reachability.svelte';
	import { useLastNameAnswers } from '$lib/components/surnames/last-name-answers.svelte';
	import { useHeldNames, type HeldBatch } from '$lib/surnames/held-names.svelte';
	import { namesakesAfterNaming, type NamesakeAfterNaming } from '$lib/surnames/namesakes';
	import type { PageData } from './$types';

	/*
	 * *Settings → Data quality → Last names* (docs/02 §2.2.4.2).
	 * Groups by proposed name first, then *Choose one*, then a field for everyone else. Every
	 * save is held for the undo window; nothing is written without a tap. *Not this name* and
	 * *No last name* are saved at once with Undo, and each has its drawer at the foot.
	 */
	let { data }: { data: PageData } = $props();
	const t = useTranslate();
	const names = useHeldNames(() => data.passOn);
	const answers = useLastNameAnswers();
	let namesakes = $state<NamesakeAfterNaming[]>([]);

	const disabled = $derived(!reachability.reachable);
	const offlineLine = $derived(disabled ? t('surnames.offline') : null);
	const held = names.submit((batch: HeldBatch) => {
		namesakes = [...namesakes, ...namesakesAfterNaming(data.people, batch.ids, batch.lastName)];
	});
	const left = $derived(
		[
			...data.groups.flatMap((g) => g.rows.map((r) => r.person.id)),
			...data.chooseOne.map((r) => r.person.id),
			...data.none.map((p) => p.id)
		].filter((id) => !names.hidden.has(id)).length
	);
</script>

<svelte:head><title>{t('surnames.page.pageTitle')}</title></svelte:head>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
	<header class="flex flex-col gap-1">
		<a href="/settings" class="flex items-center gap-1 text-sm text-link hover:underline">
			<Icon name="forward" size={12} />{t('nav.settings')}
		</a>
		<h1 class="text-2xl font-semibold text-fg">{t('surnames.page.title')}</h1>
		<p class="text-fg-muted">{t('surnames.page.intro')}</p>
	</header>

	<NamesakeHints hints={namesakes} />
	{#if offlineLine}<p class="text-sm text-fg-subtle">{offlineLine}</p>{/if}

	{#if left === 0}
		<EmptyState
			icon="tidy"
			title={t('surnames.page.empty.title')}
			hint={t('surnames.page.empty.hint')}
		>
			<Button href="/settings">{t('nav.settings')}</Button>
		</EmptyState>
	{:else}
		<p class="text-sm text-fg-muted" role="status">{t('contacts.count', { count: left })}</p>
		{#each data.groups as group (group.name)}
			<LastNameGroup {group} hidden={names.hidden} {disabled} {held} {answers} />
		{/each}
		<LastNameChoices rows={data.chooseOne} hidden={names.hidden} {disabled} {held} {answers} />
		<LastNameFields
			people={data.none}
			knownSurnames={data.knownSurnames}
			hidden={names.hidden}
			{disabled}
			{offlineLine}
			{held}
			{answers}
		/>
	{/if}

	{#if data.declined.length > 0}
		<details class="rounded-app bg-card p-3 shadow-card">
			<summary class="cursor-pointer text-sm font-medium text-fg-muted"
				>{t('surnames.declined', { count: data.declined.length })}</summary
			>
			<ul class="mt-2 flex flex-col gap-1">
				{#each data.declined as answer (`${answer.contactId} ${answer.name}`)}
					<li class="flex items-center gap-3 text-sm">
						<span class="min-w-0 flex-1 text-fg"
							>{t('surnames.declinedRow', { person: answer.personName, name: answer.name })}</span
						>
						<form method="POST" action="?/restoreLastName" use:enhance>
							<input type="hidden" name="contactId" value={answer.contactId} />
							<input type="hidden" name="lastName" value={answer.name} />
							<Button variant="ghost" size="sm">{t('surnames.offerAgain')}</Button>
						</form>
					</li>
				{/each}
			</ul>
		</details>
	{/if}

	{#if data.settled.length > 0}
		<details class="rounded-app bg-card p-3 shadow-card" data-testid="last-names-settled">
			<summary class="cursor-pointer text-sm font-medium text-fg-muted"
				>{t('surnames.settled', { count: data.settled.length })}</summary
			>
			<p class="mt-2 text-xs text-fg-subtle">{t('surnames.settledIntro')}</p>
			<ul class="mt-1 flex flex-col gap-1">
				{#each data.settled as person (person.contactId)}
					<li class="flex items-center gap-3 text-sm">
						<a
							href="/contacts/{person.contactId}"
							class="min-w-0 flex-1 truncate text-fg hover:underline">{person.personName}</a
						>
						<form method="POST" action="?/askAgainForLastName" use:enhance>
							<input type="hidden" name="contactId" value={person.contactId} />
							<Button
								variant="ghost"
								size="sm"
								{disabled}
								label={t('surnames.askAgainFor', { name: person.personName })}
								>{t('surnames.askAgain')}</Button
							>
						</form>
					</li>
				{/each}
			</ul>
		</details>
	{/if}
</main>
