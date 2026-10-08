<script lang="ts">
	import FormerlyMark from '$lib/components/people/FormerlyMark.svelte';
	import FoundByJobMark from '$lib/components/people/FoundByJobMark.svelte';
	import JobLine from '$lib/components/people/JobLine.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import { newPersonHref } from '$lib/people/new-person';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const t = useTranslate();
	const hasQuery = $derived(data.q.length > 0);
	const total = $derived(data.results.contacts.length + data.results.notes.length);
</script>

<svelte:head><title>{t('common.pageTitle', { page: t('search.title') })}</title></svelte:head>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
	<h1 class="text-2xl font-semibold text-fg">{t('search.title')}</h1>

	<form method="GET" class="flex gap-2">
		<input
			type="search"
			name="q"
			value={data.q}
			placeholder={t('search.placeholder')}
			aria-label={t('search.title')}
			class="flex-1 rounded-app border border-border-input bg-bg px-4 py-2.5 text-fg"
		/>
		<Button variant="primary">{t('common.search')}</Button>
	</form>

	{#if hasQuery}
		{#if total === 0}
			<!-- Nobody found is usually somebody new: the query is already their name. -->
			<EmptyState
				icon="search"
				title={t('search.noResults', { query: data.q })}
				hint={t('search.noResultsHint')}
			>
				<Button variant="primary" icon="add" href={newPersonHref({ name: data.q })}>
					{t('contacts.addNamed', { name: data.q })}
				</Button>
			</EmptyState>
		{:else}
			{#if data.results.contacts.length > 0}
				<section class="flex flex-col gap-1">
					<h2 class="text-sm font-medium text-fg-muted">{t('search.people')}</h2>
					{#each data.results.contacts as c (c.id)}
						<a
							href="/contacts/{c.id}"
							class="flex items-center gap-3 rounded-app px-3 py-2 transition-colors hover:bg-card hover:shadow-card"
						>
							<Avatar id={c.id} name={c.displayName} avatarPhotoId={c.avatarPhotoId} size={32} />
							<!-- The job gets its own line under the name and description (docs/02 §2.9). -->
							<span class="flex min-w-0 flex-col">
								<span class="flex min-w-0 items-center gap-1">
									<span class="shrink-0 text-fg"
										>{c.displayName}<FormerlyMark name={c.formerly} /><FoundByJobMark
											found={c.foundByJob}
										/></span
									>
									{#if c.description}<span class="truncate text-sm text-fg-muted"
											>· {c.description}</span
										>{/if}
								</span>
								<JobLine job={c} />
							</span>
						</a>
					{/each}
				</section>
			{/if}

			{#if data.results.notes.length > 0}
				<section class="flex flex-col gap-1">
					<h2 class="text-sm font-medium text-fg-muted">{t('search.notes')}</h2>
					{#each data.results.notes as n (n.noteId)}
						<a
							href="/contacts/{n.contactId}"
							class="flex flex-col rounded-app border border-transparent px-3 py-2 hover:border-border hover:bg-card"
						>
							<span class="text-sm text-fg-muted">
								{#if n.title}{n.title} ·
								{/if}{t('search.noteOn', { name: n.contactName })}
							</span>
							<span class="truncate text-fg">{n.snippet}</span>
						</a>
					{/each}
				</section>
			{/if}
		{/if}
	{:else}
		<p class="text-fg-subtle">{t('search.prompt')}</p>
	{/if}
</main>
