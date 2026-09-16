<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import KinSuggestions from '$lib/components/KinSuggestions.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { ActionData, PageData } from './$types';

	/*
	 * The household-wide relationship review (docs/02 §2.4.1,
	 * docs/concepts/relationship-suggestions.md §6.6; mockup in
	 * `docs/concepts/relationship-review-concept.html`).
	 *
	 * The rows are the person page's rows — one component for every place a suggestion is
	 * answered, so a household does not have to learn the same question twice. What this screen
	 * adds is the grouping: forty sentences in one list is not help, and the claims about one
	 * person read as a page of their family when they arrive together.
	 *
	 * Every control is a form or a link and the declined list is a `<details>`, so the whole
	 * screen works with no JavaScript at all.
	 */
	let { data, form }: { data: PageData; form: ActionData } = $props();

	const t = useTranslate();
</script>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
	<header class="flex flex-col gap-1">
		<a href="/settings" class="flex items-center gap-1 text-sm text-link hover:underline">
			<Icon name="forward" size={12} />{t('nav.settings')}
		</a>
		<h1 class="text-2xl font-semibold text-fg">{t('settings.relationships.title')}</h1>
		<p class="text-fg-muted">{t('settings.relationships.intro')}</p>
	</header>

	{#if form?.error}
		<p class="rounded-app bg-danger/10 px-3 py-2 text-sm text-danger">{form.error}</p>
	{/if}

	{#if !data.open}
		<EmptyState
			icon="people"
			title={t('settings.relationships.idle')}
			hint={t('settings.relationships.idleHint')}
		>
			<Button variant="primary" icon="search" href="/settings/relationships?review">
				{t('settings.relationships.check')}
			</Button>
		</EmptyState>
	{:else}
		<div class="flex flex-wrap items-center justify-between gap-3">
			<p class="text-sm text-fg-muted">
				{t('settings.relationships.openCount', { count: data.openCount })}
			</p>
			<Button variant="ghost" size="sm" icon="search" href="/settings/relationships?review">
				{t('settings.relationships.checkAgain')}
			</Button>
		</div>

		{#if data.groups.length === 0}
			<p class="rounded-app bg-card p-4 text-sm text-fg-muted shadow-card">
				{t('settings.relationships.nothing')}
			</p>
		{:else}
			{#each data.groups as group (group.subjectId)}
				<section class="flex flex-col gap-2 rounded-app bg-card p-4 shadow-card">
					<a
						href="/contacts/{group.subjectId}#relationships"
						class="flex items-center gap-3 text-fg hover:underline"
					>
						<Avatar name={group.subjectName} id={group.subjectId} size={32} />
						<span class="font-medium">{group.subjectName}</span>
					</a>
					<KinSuggestions suggestions={group.suggestions} />
				</section>
			{/each}
		{/if}

		<!--
			What the household has already turned down, one disclosure away with the member and
			the day on it — a *no* is never a silent permanent veto (§6.4).
		-->
		{#if data.declinedCount > 0}
			<KinSuggestions
				suggestions={data.declined}
				nameOfMember={(id) => data.memberNames[id] ?? null}
			/>
		{/if}
	{/if}
</main>
