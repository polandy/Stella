<script lang="ts">
	import { untrack } from 'svelte';
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import LanguagePicker from '$lib/components/LanguagePicker.svelte';
	import PersonSearchSelect from '$lib/components/PersonSearchSelect.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const t = useTranslate();

	/* Who the member says they are (docs/02 §2.1.3) — the picker follows what is stored. */
	let selfIds = $state<string[]>(
		untrack(() => (data.user.selfContactId ? [data.user.selfContactId] : []))
	);
	// The shell's list carries no description; the picker's shape wants the field present.
	const pickable = $derived(data.people.map((person) => ({ ...person, description: null })));
	$effect(() => {
		selfIds = data.user.selfContactId ? [data.user.selfContactId] : [];
	});
</script>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
	<header>
		<h1 class="text-2xl font-semibold text-fg">{t('settings.title')}</h1>
		<p class="text-fg-muted">{t('settings.intro')}</p>
	</header>

	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-medium text-fg-muted">{t('settings.language.heading')}</h2>
		<div class="flex flex-col gap-3 rounded-app bg-card p-4 shadow-card">
			<div>
				<p class="font-medium text-fg">{t('settings.language.label')}</p>
				<p class="text-sm text-fg-muted">{t('settings.language.hint')}</p>
			</div>
			<LanguagePicker />
		</div>
	</section>

	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-medium text-fg-muted">{t('settings.self.heading')}</h2>
		<div class="flex flex-col gap-3 rounded-app bg-card p-4 shadow-card">
			<div>
				<label for="self-contact" class="font-medium text-fg">{t('settings.self.label')}</label>
				<p class="text-sm text-fg-muted">{t('settings.self.hint')}</p>
			</div>
			<form method="POST" action="?/setSelf" class="flex flex-wrap items-center gap-2">
				<PersonSearchSelect
					people={pickable}
					name="contactId"
					bind:selectedIds={selfIds}
					id="self-contact"
					placeholder={t('settings.self.placeholder')}
					class="min-w-[14rem] flex-1"
				/>
				<Button type="submit">{t('common.save')}</Button>
			</form>
			{#if data.user.selfContactId}
				<form method="POST" action="?/setSelf">
					<button type="submit" class="text-sm text-link hover:underline">
						{t('settings.self.clear')}
					</button>
				</form>
			{/if}
			{#if form?.selfError}
				<p class="text-sm text-danger">{form.selfError}</p>
			{:else if form?.selfSaved}
				<p class="text-sm text-fg-muted">{form.selfSaved}</p>
			{/if}
		</div>
	</section>

	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-medium text-fg-muted">{t('settings.data.heading')}</h2>
		{#if data.isAdmin}
			<a href="/settings/import" class="flex items-center gap-4 rounded-app bg-card p-4 shadow-card transition-colors hover:bg-card-hover">
				<span class="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary" aria-hidden="true"><Icon name="import" size={18} /></span>
				<span class="min-w-0 flex-1">
					<span class="block font-medium text-fg">{t('settings.data.importPeople')}</span>
					<span class="block text-sm text-fg-muted">{t('settings.data.importPeopleBlurb')}</span>
				</span>
				<span class="text-fg-subtle" aria-hidden="true"><Icon name="forward" size={16} /></span>
			</a>
			<form method="POST" action="/settings/export" class="contents">
				<button type="submit" class="flex w-full items-center gap-4 rounded-app bg-card p-4 text-left shadow-card transition-colors hover:bg-card-hover">
					<span class="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary" aria-hidden="true"><Icon name="export" size={18} /></span>
					<span class="min-w-0 flex-1">
						<span class="block font-medium text-fg">{t('settings.data.download')}</span>
						<span class="block text-sm text-fg-muted">{t('settings.data.downloadBlurb')}</span>
					</span>
					<span class="text-fg-subtle" aria-hidden="true"><Icon name="forward" size={16} /></span>
				</button>
			</form>
			<a href="/settings/import/archive" class="flex items-center gap-4 rounded-app bg-card p-4 shadow-card transition-colors hover:bg-card-hover">
				<span class="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary" aria-hidden="true"><Icon name="archive" size={18} /></span>
				<span class="min-w-0 flex-1">
					<span class="block font-medium text-fg">{t('settings.data.restore')}</span>
					<span class="block text-sm text-fg-muted">{t('settings.data.restoreBlurb')}</span>
				</span>
				<span class="text-fg-subtle" aria-hidden="true"><Icon name="forward" size={16} /></span>
			</a>
			<a href="/settings/relationship-types" class="flex items-center gap-4 rounded-app bg-card p-4 shadow-card transition-colors hover:bg-card-hover">
				<span class="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary" aria-hidden="true"><Icon name="people" size={18} /></span>
				<span class="min-w-0 flex-1">
					<span class="block font-medium text-fg">{t('settings.data.relationshipTypes')}</span>
					<span class="block text-sm text-fg-muted">{t('settings.data.relationshipTypesBlurb')}</span>
				</span>
				<span class="text-fg-subtle" aria-hidden="true"><Icon name="forward" size={16} /></span>
			</a>
		{:else}
			<p class="text-sm text-fg-subtle">{t('settings.data.adminOnly')}</p>
		{/if}
	</section>

	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-medium text-fg-muted">{t('settings.account.heading')}</h2>
		<form method="POST" action="/logout" class="contents">
			<button type="submit" class="flex w-full items-center gap-4 rounded-app bg-card p-4 text-left shadow-card transition-colors hover:bg-card-hover">
				<span class="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary" aria-hidden="true"><Icon name="signOut" size={18} /></span>
				<span class="min-w-0 flex-1">
					<span class="block font-medium text-fg">{t('nav.signOut')}</span>
				</span>
			</button>
		</form>
	</section>
</main>
