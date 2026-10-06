<script lang="ts">
	import FormError from '$lib/components/FormError.svelte';
	import SignOutForm from '$lib/components/SignOutForm.svelte';
	import { untrack } from 'svelte';
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import InstallCard from '$lib/components/InstallCard.svelte';
	import LanguagePicker from '$lib/components/LanguagePicker.svelte';
	import PersonSearchSelect from '$lib/components/PersonSearchSelect.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { newPersonHref } from '$lib/people/new-person';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const i18n = useI18n();
	const t = i18n.t;

	/* When the release check last got an answer — shown only when today's attempt failed. */
	const checkedAt = (at: number) =>
		new Date(at).toLocaleString(i18n.intlLocale, { dateStyle: 'short', timeStyle: 'short' });

	/* What the Immich line says about a key that lacks one of the scopes Stella reads with (§4.1). */
	const SCOPE_MESSAGE = {
		'user.read': 'immich.settings.scope.user.read',
		'person.read': 'immich.settings.scope.person.read',
		'person.statistics': 'immich.settings.scope.person.statistics',
		'asset.read': 'immich.settings.scope.asset.read',
		'asset.view': 'immich.settings.scope.asset.view'
	} as const;

	/* Who the member says they are (docs/02 §2.1.3) — the picker follows what is stored. */
	let selfIds = $state<string[]>(
		untrack(() => (data.user.selfContactId ? [data.user.selfContactId] : []))
	);
	$effect(() => {
		selfIds = data.user.selfContactId ? [data.user.selfContactId] : [];
	});
</script>

<svelte:head><title>{t('common.pageTitle', { page: t('settings.title') })}</title></svelte:head>

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
				{#if data.people.length > 0}
					<label for="self-contact" class="font-medium text-fg">{t('settings.self.label')}</label>
				{:else}
					<p class="font-medium text-fg">{t('settings.self.label')}</p>
				{/if}
				<p class="text-sm text-fg-muted">{t('settings.self.hint')}</p>
			</div>
			<!-- With nobody to pick from, the picker would be a dead end: offer to add yourself. -->
			{#if data.people.length === 0}
				<div class="flex flex-wrap items-center gap-3" data-testid="self-nobody-yet">
					<p class="min-w-0 flex-1 basis-56 text-sm text-fg-muted">
						{t('settings.self.nobodyYet')}
					</p>
					<Button variant="primary" icon="self" href={newPersonHref({ self: true })}
						>{t('settings.self.addYourself')}</Button
					>
				</div>
			{:else}
				<form method="POST" action="?/setSelf" class="flex flex-wrap items-center gap-2">
					<PersonSearchSelect
						people={data.people}
						name="contactId"
						bind:selectedIds={selfIds}
						id="self-contact"
						placeholder={t('settings.self.placeholder')}
						class="min-w-[14rem] flex-1"
					/>
					<Button type="submit">{t('common.save')}</Button>
				</form>
				{#if !data.user.selfContactId}
					<p class="text-sm text-fg-muted">
						{t('settings.self.notListed')}
						<a href={newPersonHref({ self: true })} class="font-medium text-link hover:underline"
							>{t('settings.self.addYourself')}</a
						>
					</p>
				{/if}
			{/if}
			{#if data.user.selfContactId}
				<form method="POST" action="?/setSelf">
					<Button variant="ghost" size="sm">{t('settings.self.clear')}</Button>
				</form>
			{/if}
			<FormError message={form?.selfError} variant="inline" />
			{#if !form?.selfError && form?.selfSaved}
				<p class="text-sm text-fg-muted">{form.selfSaved}</p>
			{/if}
		</div>
	</section>

	<!--
		Checks over what the household has entered: the relationship review (docs/02 §2.4.1) and
		the people known by a first name only (§2.2.3). Their own section rather than part of Data,
		because they are for every member: the answers belong to the household, not to the admin
		who happened to click.
	-->
	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-medium text-fg-muted">{t('settings.quality.heading')}</h2>
		<a
			href="/settings/relationships"
			class="flex items-center gap-4 rounded-app bg-card p-4 shadow-card transition-colors hover:bg-card-hover"
		>
			<span
				class="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"
				aria-hidden="true"><Icon name="search" size={18} /></span
			>
			<span class="min-w-0 flex-1">
				<span class="block font-medium text-fg">{t('settings.relationships.title')}</span>
				<span class="block text-sm text-fg-muted">{t('settings.relationships.blurb')}</span>
			</span>
			<span class="text-fg-subtle" aria-hidden="true"><Icon name="forward" size={16} /></span>
		</a>
		<a
			href="/settings/last-names"
			class="flex items-center gap-4 rounded-app bg-card p-4 shadow-card transition-colors hover:bg-card-hover"
		>
			<span
				class="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"
				aria-hidden="true"><Icon name="rename" size={18} /></span
			>
			<span class="min-w-0 flex-1">
				<span class="block font-medium text-fg">{t('surnames.page.title')}</span>
				<span class="block text-sm text-fg-muted" data-testid="last-names-count">
					{data.lastNames.missing > 0 ? t('surnames.count', data.lastNames) : t('surnames.blurb')}
				</span>
			</span>
			<span class="text-fg-subtle" aria-hidden="true"><Icon name="forward" size={16} /></span>
		</a>
		<a
			href="/settings/first-name-only"
			class="flex items-center gap-4 rounded-app bg-card p-4 shadow-card transition-colors hover:bg-card-hover"
		>
			<span
				class="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"
				aria-hidden="true"><Icon name="tidy" size={18} /></span
			>
			<span class="min-w-0 flex-1">
				<span class="block font-medium text-fg">{t('settings.firstNameOnly.title')}</span>
				<span class="block text-sm text-fg-muted">{t('settings.firstNameOnly.blurb')}</span>
			</span>
			{#if data.firstNameOnlyCount > 0}
				<span
					class="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary tabular-nums"
					data-testid="first-name-only-count"
				>
					{data.firstNameOnlyCount}
				</span>
			{/if}
			<span class="text-fg-subtle" aria-hidden="true"><Icon name="forward" size={16} /></span>
		</a>
	</section>

	<!-- Every member's, not only the admin's: a token acts as whoever made it (docs/02 §2.16.1). -->
	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-medium text-fg-muted">{t('settings.api.heading')}</h2>
		<a
			href="/settings/api-tokens"
			class="flex items-center gap-4 rounded-app bg-card p-4 shadow-card transition-colors hover:bg-card-hover"
		>
			<span
				class="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"
				aria-hidden="true"><Icon name="apiToken" size={18} /></span
			>
			<span class="min-w-0 flex-1">
				<span class="block font-medium text-fg">{t('settings.api.title')}</span>
				<span class="block text-sm text-fg-muted">{t('settings.api.blurb')}</span>
			</span>
			<span class="text-fg-subtle" aria-hidden="true"><Icon name="forward" size={16} /></span>
		</a>
	</section>

	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-medium text-fg-muted">{t('settings.data.heading')}</h2>
		{#if data.isAdmin}
			<a
				href="/settings/import"
				class="flex items-center gap-4 rounded-app bg-card p-4 shadow-card transition-colors hover:bg-card-hover"
			>
				<span
					class="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"
					aria-hidden="true"><Icon name="import" size={18} /></span
				>
				<span class="min-w-0 flex-1">
					<span class="block font-medium text-fg">{t('settings.data.importPeople')}</span>
					<span class="block text-sm text-fg-muted">{t('settings.data.importPeopleBlurb')}</span>
				</span>
				<span class="text-fg-subtle" aria-hidden="true"><Icon name="forward" size={16} /></span>
			</a>
			<form method="POST" action="/settings/export" class="contents">
				<button
					type="submit"
					class="flex w-full items-center gap-4 rounded-app bg-card p-4 text-left shadow-card transition-colors hover:bg-card-hover"
				>
					<span
						class="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"
						aria-hidden="true"><Icon name="export" size={18} /></span
					>
					<span class="min-w-0 flex-1">
						<span class="block font-medium text-fg">{t('settings.data.download')}</span>
						<span class="block text-sm text-fg-muted">{t('settings.data.downloadBlurb')}</span>
					</span>
					<span class="text-fg-subtle" aria-hidden="true"><Icon name="forward" size={16} /></span>
				</button>
			</form>
			<a
				href="/settings/import/archive"
				class="flex items-center gap-4 rounded-app bg-card p-4 shadow-card transition-colors hover:bg-card-hover"
			>
				<span
					class="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"
					aria-hidden="true"><Icon name="archive" size={18} /></span
				>
				<span class="min-w-0 flex-1">
					<span class="block font-medium text-fg">{t('settings.data.restore')}</span>
					<span class="block text-sm text-fg-muted">{t('settings.data.restoreBlurb')}</span>
				</span>
				<span class="text-fg-subtle" aria-hidden="true"><Icon name="forward" size={16} /></span>
			</a>
			<a
				href="/settings/relationship-types"
				class="flex items-center gap-4 rounded-app bg-card p-4 shadow-card transition-colors hover:bg-card-hover"
			>
				<span
					class="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"
					aria-hidden="true"><Icon name="people" size={18} /></span
				>
				<span class="min-w-0 flex-1">
					<span class="block font-medium text-fg">{t('settings.data.relationshipTypes')}</span>
					<span class="block text-sm text-fg-muted"
						>{t('settings.data.relationshipTypesBlurb')}</span
					>
				</span>
				<span class="text-fg-subtle" aria-hidden="true"><Icon name="forward" size={16} /></span>
			</a>
		{:else}
			<p class="text-sm text-fg-subtle">{t('settings.data.adminOnly')}</p>
		{/if}
	</section>

	<!-- Every member sees the line; the admin also reads what the key means (docs/concepts/immich.md §4.1). -->
	{#if data.immich}
		<section class="flex flex-col gap-3" data-testid="immich-settings">
			<h2 class="text-sm font-medium text-fg-muted">{t('immich.settings.heading')}</h2>
			<div class="flex items-start gap-4 rounded-app bg-card p-4 shadow-card">
				<span
					class="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"
					aria-hidden="true"><Icon name="photo" size={18} /></span
				>
				<div class="flex min-w-0 flex-1 flex-col gap-1">
					{#await data.immich}
						<p class="text-sm text-fg-subtle">{t('immich.settings.checking')}</p>
					{:then status}
						{#if status.state === 'connected'}
							<p class="font-medium text-fg" data-testid="immich-status">
								{t('immich.settings.connected', {
									owner: status.owner.name || status.owner.email,
									version: status.version
								})}
							</p>
							<p class="text-sm text-fg-muted">{t('immich.settings.howToLink')}</p>
						{:else}
							<p class="font-medium text-danger" role="status" data-testid="immich-status">
								{#if status.state === 'tooOld'}
									{t('immich.settings.tooOld', { version: status.version })}
								{:else if status.state === 'missingScope'}
									{t(SCOPE_MESSAGE[status.scope])}
								{:else if status.state === 'keyRejected'}
									{t('immich.settings.keyRejected')}
								{:else}
									{t('immich.settings.unreachable')}
								{/if}
							</p>
						{/if}
					{/await}
					{#if data.isAdmin}
						<p class="text-sm text-fg-muted">{t('immich.settings.sharing')}</p>
					{/if}
				</div>
			</div>
			<a
				href="/settings/immich"
				class="flex items-center gap-4 rounded-app bg-card p-4 shadow-card transition-colors hover:bg-card-hover"
			>
				<span
					class="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"
					aria-hidden="true"><Icon name="people" size={18} /></span
				>
				<span class="min-w-0 flex-1">
					<span class="block font-medium text-fg">{t('immich.match.title')}</span>
					<span class="block text-sm text-fg-muted">{t('immich.match.blurb')}</span>
				</span>
				<span class="text-fg-subtle" aria-hidden="true"><Icon name="forward" size={16} /></span>
			</a>
		</section>
	{/if}

	<InstallCard />

	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-medium text-fg-muted">{t('settings.account.heading')}</h2>
		<SignOutForm class="contents">
			<button
				type="submit"
				class="flex w-full items-center gap-4 rounded-app bg-card p-4 text-left shadow-card transition-colors hover:bg-card-hover"
			>
				<span
					class="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"
					aria-hidden="true"><Icon name="signOut" size={18} /></span
				>
				<span class="min-w-0 flex-1">
					<span class="block font-medium text-fg">{t('nav.signOut')}</span>
				</span>
			</button>
		</SignOutForm>
	</section>

	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-medium text-fg-muted">{t('settings.about.heading')}</h2>
		<div class="flex flex-col gap-2 rounded-app bg-card p-4 shadow-card">
			<p class="font-medium text-fg">{t('settings.about.version', { version: data.version })}</p>
			{#if data.update}
				{#await data.update}
					<p class="text-sm text-fg-subtle">{t('settings.about.checking')}</p>
				{:then update}
					{#if update.state === 'available'}
						<p class="flex flex-wrap items-center gap-2 text-sm">
							<span
								class="rounded-control bg-primary-soft px-2 py-0.5 text-xs font-medium tracking-wide text-primary uppercase"
								>{t('settings.about.badge')}</span
							>
							<span class="text-fg"
								>{t('settings.about.available', { version: update.latest })}</span
							>
							{#if update.releaseUrl}
								<a
									class="text-link hover:underline"
									href={update.releaseUrl}
									target="_blank"
									rel="noopener noreferrer">{t('settings.about.releaseNotes')}</a
								>
							{/if}
						</p>
					{:else if update.state === 'unreachable'}
						<p class="text-sm text-fg-muted">{t('settings.about.unreachable')}</p>
					{:else}
						<p class="text-sm text-fg-muted">{t('settings.about.current')}</p>
					{/if}
					{#if update.stale && update.checkedAt !== null}
						<p class="text-sm text-fg-subtle">
							{t('settings.about.unreachableSince', { when: checkedAt(update.checkedAt) })}
						</p>
					{/if}
				{/await}
			{:else if data.isAdmin}
				<!-- Switching the check on is the operator's business, so only they are told about it. -->
				<p class="text-sm text-fg-subtle">{t('settings.about.off')}</p>
			{/if}
		</div>
	</section>
</main>
