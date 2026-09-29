<script lang="ts">
	import { enhance } from '$app/forms';
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { sinceLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { ActionData, PageData } from './$types';

	/*
	 * People known by a first name only (docs/02 §2.2.3). Each row takes a description in place
	 * and leaves the list once it has one; the name opens their page, where merging and
	 * archiving already live.
	 */

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const i18n = useI18n();
	const t = i18n.t;
</script>

<svelte:head><title>{t('settings.firstNameOnly.pageTitle')}</title></svelte:head>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
	<header class="flex flex-col gap-1">
		<a href="/settings" class="flex items-center gap-1 text-sm text-link hover:underline">
			<Icon name="forward" size={12} />{t('nav.settings')}
		</a>
		<h1 class="text-2xl font-semibold text-fg">{t('settings.firstNameOnly.title')}</h1>
		<p class="text-fg-muted">{t('settings.firstNameOnly.intro')}</p>
	</header>

	{#if data.people.length === 0}
		<EmptyState icon="tidy" title={t('settings.firstNameOnly.empty.title')} hint={t('settings.firstNameOnly.empty.hint')}>
			<Button href="/settings">{t('nav.settings')}</Button>
		</EmptyState>
	{:else}
		<p class="text-sm text-fg-muted" role="status">{t('contacts.count', { count: data.people.length })}</p>
		<ul class="flex flex-col gap-1" data-testid="first-name-only">
			{#each data.people as person (person.id)}
				{@const since = sinceLabel(i18n, person.lastTouchedOn, data.today)}
				<li
					class="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-app px-2.5 py-2"
					data-testid="first-name-only-row"
				>
					<Avatar id={person.id} name={person.displayName} avatarPhotoId={person.avatarPhotoId} size={36} />
					<a href="/contacts/{person.id}" class="truncate font-medium text-fg hover:underline">{person.displayName}</a>
					<span
						class="whitespace-nowrap text-xs tabular-nums text-fg-subtle"
						title={since ? t('contacts.lastWrittenAboutOn', { date: person.lastTouchedOn ?? '' }) : t('contacts.nothingWrittenYet')}
					>
						{since ?? '—'}
					</span>
					<form method="POST" action="?/describe" use:enhance class="col-span-2 col-start-2 flex gap-2">
						<input type="hidden" name="id" value={person.id} />
						<label class="min-w-0 flex-1">
							<span class="sr-only">{t('settings.firstNameOnly.knowThemBy', { name: person.displayName })}</span>
							<input
								name="description"
								type="text"
								required
								autocomplete="off"
								placeholder={t('components.namesake.placeholder')}
								class="w-full min-w-0 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-fg placeholder:text-fg-subtle"
							/>
						</label>
						<Button type="submit" size="sm">{t('common.save')}</Button>
					</form>
					{#if form?.describedId === person.id}
						<p class="col-span-2 col-start-2 text-sm text-danger" role="alert">{form.describeError}</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</main>
