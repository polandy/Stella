<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { sinceLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { accentChipStyle } from '$lib/design/tokens';
	import { groupByLetter, matchesQuery } from '$lib/people/directory';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const i18n = useI18n();
	const t = i18n.t;

	let query = $state('');

	const found = $derived(data.contacts.filter((c) => matchesQuery(c, query)));
	const groups = $derived(groupByLetter(found));
</script>

<svelte:head><title>{t('contacts.title')}</title></svelte:head>

<main class="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6 md:px-6 md:py-10">
	<header>
		<h1 class="text-2xl font-semibold text-fg">
			{data.showArchived ? t('contacts.headingArchived') : t('contacts.heading')}
		</h1>
		<p class="text-sm text-fg-muted">
			{t('contacts.count', { count: data.contacts.length })}{#if data.activeTag}
				{' '}{t('contacts.withThisTag')}{/if}{#if data.showArchived}{t(
					'contacts.archivedSuffix'
				)}{/if}
		</p>
	</header>

	<!-- Find as you type. Filtering runs on what is already loaded, so there is no round trip
	     and no wait between the keystroke and the list. -->
	<label class="flex items-center gap-2 rounded-control border border-border bg-card px-3 py-2 shadow-card focus-within:border-primary">
		<Icon name="search" size={15} />
		<span class="sr-only">{t('contacts.find')}</span>
		<input
			type="search"
			bind:value={query}
			placeholder={t('contacts.findPlaceholder')}
			autocomplete="off"
			class="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
		/>
	</label>

	{#if data.tags.length > 0 || data.archivedCount > 0}
		<div class="flex flex-wrap items-center gap-2">
			<a
				href="/contacts"
				class="rounded-full px-3 py-1 text-sm font-medium transition-colors"
				class:bg-primary-soft={!data.activeTag && !data.showArchived}
				class:text-primary={!data.activeTag && !data.showArchived}
				class:text-fg-muted={data.activeTag || data.showArchived}
			>
				{t('contacts.all')}
			</a>
			{#each data.tags as tag (tag.id)}
				<a
					href="/contacts?tag={tag.id}"
					class="rounded-full px-3 py-1 text-sm font-medium"
					style={accentChipStyle(tag.color, { active: data.activeTag === tag.id })}
				>
					{tag.name}
				</a>
			{/each}
			<!-- The archive needs a door, or the only way back is to remember a name. -->
			{#if data.archivedCount > 0}
				<a
					href="/contacts?archived"
					class="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors"
					class:bg-primary-soft={data.showArchived}
					class:text-primary={data.showArchived}
					class:text-fg-muted={!data.showArchived}
				>
					<Icon name="archive" size={13} />{t('contacts.archivedChip', {
						count: data.archivedCount
					})}
				</a>
			{/if}
		</div>
	{/if}

	{#if data.showArchived && data.contacts.length === 0}
		<EmptyState
			icon="archive"
			title={t('contacts.emptyArchive.title')}
			hint={t('contacts.emptyArchive.hint')}
		>
			<Button href="/contacts">{t('contacts.emptyArchive.back')}</Button>
		</EmptyState>
	{:else if data.contacts.length === 0}
		<EmptyState icon="people" title={t('contacts.empty.title')} hint={t('contacts.empty.hint')}>
			<Button variant="primary" icon="add" href="/contacts/new">{t('nav.addPerson')}</Button>
		</EmptyState>
	{:else if found.length === 0}
		<p class="px-2 py-6 text-center text-sm text-fg-muted" role="status">{t('contacts.noMatch', { query })}</p>
	{:else}
		<div class="flex flex-col gap-4" data-testid="people-directory">
			{#if !data.showArchived}
				<div class="flex justify-end px-2.5 text-[11px] font-medium text-fg-subtle" aria-hidden="true">{t('contacts.lastWrittenAbout')}</div>
			{/if}
			{#each groups as group (group.letter)}
				<section>
					<h2 class="sticky top-0 z-10 flex items-center gap-3 bg-bg py-1.5 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
						{group.letter}<span class="h-px flex-1 bg-border"></span>
					</h2>
					<ul class="flex flex-col">
						{#each group.people as contact (contact.id)}
							{@const since = sinceLabel(i18n, contact.lastTouchedOn, data.today)}
							<li>
								<a
									href="/contacts/{contact.id}"
									class="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 rounded-app px-2.5 py-2 transition-colors hover:bg-card"
								>
									<Avatar id={contact.id} name={contact.displayName} avatarPhotoId={contact.avatarPhotoId} size={36} />
									<span class="min-w-0">
										<span class="flex items-center gap-1.5">
											<span class="truncate font-medium text-fg">{contact.displayName}</span>
											{#if contact.id === data.user.selfContactId}
												<span
													data-testid="self-marker"
													class="rounded-full bg-primary-soft px-1.5 py-0.5 text-[11px] font-medium text-primary"
												>
													{t('common.you')}
												</span>
											{/if}
											{#if contact.visibility === 'private'}
												<Icon name="private" size={12} />
												<span class="sr-only">{t('contacts.private')}</span>
											{/if}
										</span>
										{#if contact.description}
											<span class="block truncate text-sm text-fg-muted">{contact.description}</span>
										{/if}
									</span>
									<!-- The "last written about" read leaves archived people out, so claiming
									     anything here would be claiming they were never written about. -->
									{#if data.showArchived}
										<span class="whitespace-nowrap text-xs text-fg-subtle">{t('contacts.archived')}</span>
									{:else}
										<span class="whitespace-nowrap text-xs tabular-nums text-fg-subtle" title={since
												? t('contacts.lastWrittenAboutOn', { date: contact.lastTouchedOn ?? '' })
												: t('contacts.nothingWrittenYet')}>
											{since ?? '—'}
										</span>
									{/if}
								</a>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>
	{/if}
</main>
