<script lang="ts">
	import FormerlyMark from '$lib/components/people/FormerlyMark.svelte';
	import FoundByJobMark from '$lib/components/people/FoundByJobMark.svelte';
	import JobLine from '$lib/components/people/JobLine.svelte';
	import GiftStateMark from '$lib/components/person/GiftStateMark.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import PrivateMark from '$lib/components/ui/PrivateMark.svelte';
	import Veil from '$lib/components/ui/Veil.svelte';
	import { stateLabel } from '$lib/gifts/labels';
	import { journalTagHref } from '$lib/hashtags/hashtags';
	import { newPersonHref } from '$lib/people/new-person';
	import { contactSectionPath } from '$lib/people/sections';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { useVeil } from '$lib/privacy/veil.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const veil = useVeil();
	const hasQuery = $derived(data.q.length > 0);
	const total = $derived(
		data.results.contacts.length +
			data.results.notes.length +
			data.results.gifts.length +
			data.results.moments.length
	);

	/** A moment found by its tag opens its journal filtered by that tag (docs/02 §2.20.2). */
	function momentHref(contactId: string): string {
		const tag = data.results.tag;
		return tag ? journalTagHref(contactId)(tag) : `/contacts/${contactId}/journal`;
	}

	function shortDate(iso: string): string {
		const [y, m, d] = iso.split('-').map(Number);
		return new Date(y, m - 1, d).toLocaleDateString(i18n.intlLocale, {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}
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
		{#if total === 0 && data.results.tag}
			<EmptyState
				icon="search"
				title={t('search.tagNone', { tag: data.q.trim().slice(1) })}
				hint={t('search.tagNoneHint')}
			/>
		{:else if total === 0}
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
							<span class="flex flex-wrap items-center gap-x-2 text-sm text-fg-muted">
								<span
									>{#if n.title && !(n.visibility === 'private' && veil.isVeiled(`note:${n.noteId}`))}{n.title}
										·
									{/if}{t('search.noteOn', { name: n.contactName })}</span
								>
								{#if n.visibility === 'private'}<PrivateMark class="text-xs" />{/if}
							</span>
							<!-- Search finds private words, it is the author's search; they stay blurred (docs/02 §2.10.1). -->
							<Veil
								id="note:{n.noteId}"
								isPrivate={n.visibility === 'private'}
								label={t('privacy.veil.note')}
								text={n.snippet}
								textClass="truncate text-fg"
								passive
							>
								<span class="block truncate text-fg">{n.snippet}</span>
							</Veil>
						</a>
					{/each}
				</section>
			{/if}

			{#if data.results.gifts.length > 0}
				<!-- A gift leads to the card it lives on, not just the person (docs/02 §2.25.5). -->
				<section class="flex flex-col gap-1">
					<h2 class="text-sm font-medium text-fg-muted">{t('search.gifts')}</h2>
					{#each data.results.gifts as g (g.giftId)}
						<a
							href={contactSectionPath(g.contactId, 'gifts')}
							class="flex items-center gap-3 rounded-app border border-transparent px-3 py-2 hover:border-border hover:bg-card"
						>
							<GiftStateMark state={g.state} />
							<span class="flex min-w-0 flex-col">
								<span class="break-words text-fg">{g.title}</span>
								<!-- Wraps rather than truncates: the day it was given is the point. -->
								<span class="text-sm text-fg-muted"
									>{t('search.giftFor', { name: g.contactName })} · {stateLabel(i18n, g)}</span
								>
							</span>
						</a>
					{/each}
				</section>
			{/if}

			{#if data.results.moments.length > 0}
				<section class="flex flex-col gap-1">
					<h2 class="text-sm font-medium text-fg-muted">{t('search.moments')}</h2>
					{#each data.results.moments as m (m.entryId)}
						<a
							href={momentHref(m.contactId)}
							class="flex flex-col rounded-app border border-transparent px-3 py-2 hover:border-border hover:bg-card"
						>
							<span class="flex flex-wrap items-center gap-x-2 text-sm text-fg-muted">
								<span
									>{#if m.title && !(m.visibility === 'private' && veil.isVeiled(`journal:${m.entryId}`))}{m.title}
										·
									{/if}{t('search.momentOn', {
										date: shortDate(m.entryDate),
										name: m.contactName
									})}</span
								>
								{#if m.visibility === 'private'}<PrivateMark class="text-xs" />{/if}
							</span>
							<!-- Private words stay blurred on the author's own search, as a note's do. -->
							<Veil
								id="journal:{m.entryId}"
								isPrivate={m.visibility === 'private'}
								label={t('privacy.veil.moment')}
								text={m.snippet}
								textClass="truncate text-fg"
								passive
							>
								<span class="block truncate text-fg">{m.snippet}</span>
							</Veil>
						</a>
					{/each}
				</section>
			{/if}
		{/if}
	{:else}
		<p class="text-fg-subtle">{t('search.prompt')}</p>
	{/if}
</main>
