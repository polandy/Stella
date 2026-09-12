<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import LanguagePicker from '$lib/components/LanguagePicker.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const t = useTranslate();
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
		<form method="POST" action="/logout" class="rounded-app bg-card p-4 shadow-card">
			<button type="submit" class="w-full text-left text-sm font-medium text-fg transition-colors hover:text-fg-muted">
				{t('nav.signOut')}
			</button>
		</form>
	</section>
</main>
