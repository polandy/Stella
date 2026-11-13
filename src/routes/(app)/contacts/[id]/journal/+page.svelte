<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { dayHeading } from '$lib/dates/labels';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import JournalCompose from '$lib/components/journal/JournalCompose.svelte';
	import JournalEntryCard from '$lib/components/journal/JournalEntryCard.svelte';
	import JournalTagFilter from '$lib/components/journal/JournalTagFilter.svelte';
	import { asTyped } from '$lib/mentions/picks';
	import KeptItem from '$lib/components/pwa/KeptItem.svelte';
	import { isKept, type KeptOf } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey as buildKey } from '$lib/undo/keys';
	import { removeThroughAction } from '$lib/undo/deferred-removal';
	import type { ActionData, PageData } from './$types';
	import { useI18n } from '$lib/i18n/context.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	// People the @-picker may offer — the shell's list — minus the person whose journal this is:
	// naming them here is not a mention, it is the entry's own subject (docs/02 §2.20.1).
	const candidates = $derived(data.people.filter((p) => p.id !== data.contact.id));

	const i18n = useI18n();
	const t = i18n.t;

	const c = $derived(data.contact);

	// Entries written while Stella was out of reach show above the timeline until they are sent.
	const keptEntries = $derived(
		outbox.mine.filter(
			(item): item is KeptOf<'journal.write'> =>
				isKept(item, 'journal.write') && item.command.payload.contactId === c.id
		)
	);

	// Removing is held back for an undo window (docs/02 §2.23), same as on the story.
	const removals = useRemovals();
	const removalKey = (entry: { id: string }) => buildKey('journal', entry.id);
	function deferRemoval(
		event: SubmitEvent,
		entry: { id: string; subjects: readonly { displayName: string }[] }
	) {
		event.preventDefault();
		const body = new FormData(event.currentTarget as HTMLFormElement);
		removals.remove({
			key: removalKey(entry),
			// A moment about several people goes from every page, so the toast names them all.
			label:
				entry.subjects.length > 1
					? t('journal.removedFor', {
							names: new Intl.ListFormat(i18n.intlLocale, { type: 'conjunction' }).format(
								entry.subjects.map((s) => s.displayName)
							)
						})
					: t('journal.entryRemoved'),
			commit: async () => {
				await removeThroughAction(fetch, '?/delete', body);
				await invalidateAll();
			}
		});
	}

	// Editing an entry in place: only one at a time (docs/02 §2.20).
	let editingId = $state<string | null>(null);

	// Group the (already newest-first) entries by their day for the timeline.
	const days = $derived.by(() => {
		const groups: { date: string; items: PageData['entries'] }[] = [];
		for (const e of data.entries) {
			if (removals.isPending(removalKey(e))) continue;
			let g = groups.at(-1);
			if (!g || g.date !== e.entryDate) {
				g = { date: e.entryDate, items: [] };
				groups.push(g);
			}
			g.items.push(e);
		}
		return groups;
	});

	// Show the compose form open when there was an error, otherwise behind a button.
	let composing = $state(false);
	const showForm = $derived(composing || !!form?.journalError);
</script>

<svelte:head><title>{t('journal.title', { name: c.displayName })}</title></svelte:head>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
	<header class="flex items-center justify-between gap-4">
		<div class="flex items-center gap-3">
			<Avatar id={c.id} name={c.displayName} avatarPhotoId={c.avatarPhotoId} size={44} />
			<div>
				<h1 class="text-2xl font-semibold text-fg">{t('journal.heading')}</h1>
				<p class="text-sm text-fg-muted">{t('journal.intro', { name: c.displayName })}</p>
			</div>
		</div>
		<Button variant="primary" type="button" onclick={() => (composing = !composing)}>
			{showForm ? t('common.close') : t('journal.newEntry')}
		</Button>
	</header>

	<JournalCompose
		open={showForm}
		contact={c}
		{candidates}
		tags={data.entryTags}
		today={data.today}
		immichLibrary={data.immichLibrary}
		error={form?.journalError}
		onDone={() => (composing = false)}
	/>

	{#if keptEntries.length > 0}
		<ul class="flex flex-col gap-2" data-testid="kept-entries">
			{#each keptEntries as item (item.command.id)}
				<li>
					<KeptItem {item}>
						{#snippet meta()}<span
								>· {dayHeading(i18n, item.command.payload.entryDate, data.today)}</span
							>{/snippet}
						{#if item.command.payload.title}<p class="mt-1 font-medium text-fg">
								{item.command.payload.title}
							</p>{/if}
						<p class="mt-1 whitespace-pre-line text-fg">
							{asTyped(item.command.payload.body, [...candidates, data.contact])}
						</p>
					</KeptItem>
				</li>
			{/each}
		</ul>
	{/if}

	<JournalTagFilter tags={data.tags} active={data.activeTags} shown={data.entries.length} />

	{#if days.length}
		<ol class="flex flex-col gap-8">
			{#each days as day (day.date)}
				<li class="flex flex-col gap-3">
					<div class="flex items-center gap-3">
						<h2 class="text-sm font-semibold tracking-wide text-fg-subtle uppercase">
							{dayHeading(i18n, day.date, data.today)}
						</h2>
						<span class="h-px flex-1 bg-border"></span>
					</div>

					{#each day.items as entry (entry.id)}
						<JournalEntryCard
							{entry}
							contact={c}
							day={day.date}
							{candidates}
							tags={data.entryTags}
							immichLibrary={data.immichLibrary}
							editing={editingId === entry.id}
							onEdit={() => (editingId = entry.id)}
							onDoneEditing={() => (editingId = null)}
							onRemove={(event) => deferRemoval(event, entry)}
						/>
					{/each}
				</li>
			{/each}
		</ol>
	{:else if data.activeTags.length}
		<EmptyState icon="filter" title={t('journal.tags.none')} hint={t('journal.tags.noneHint')} />
	{:else}
		<EmptyState
			icon="journal"
			title={t('journal.empty.title')}
			hint={t('journal.empty.hint', { name: c.displayName })}
		>
			<!-- With the form already open above, a second way to open it would only distract. -->
			{#if !showForm}
				<Button variant="primary" icon="write" type="button" onclick={() => (composing = true)}
					>{t('journal.empty.write')}</Button
				>
			{/if}
		</EmptyState>
	{/if}
</main>
