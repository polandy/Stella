<script lang="ts">
	import Swap from '$lib/components/ui/Swap.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import PrivateMark from '$lib/components/ui/PrivateMark.svelte';
	import Veil from '$lib/components/ui/Veil.svelte';
	import { placeholderFor } from '$lib/privacy/veil';
	import { useVeil } from '$lib/privacy/veil.svelte';
	import { journalEntryAnchor } from '$lib/people/sections';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { ComponentProps } from 'svelte';
	import JournalEntryEditor from './JournalEntryEditor.svelte';
	import MomentWith from './MomentWith.svelte';
	import { othersThan, type SubjectFace } from '$lib/story/subjects';

	type EditorProps = ComponentProps<typeof JournalEntryEditor>;

	/*
	 * One entry on the journal's timeline (docs/02 §2.20): its title, author and text, its photos,
	 * and the author's pencil and the ×. Editing turns the card into the editor in place.
	 */
	let {
		entry,
		contact,
		day,
		candidates,
		tags,
		editing,
		onEdit,
		onDoneEditing,
		onRemove
	}: {
		entry: EditorProps['entry'] & {
			author: string | null;
			mine: boolean;
			removable: boolean;
			/** Server-rendered, already-safe Markdown (docs/02 §2.5). */
			bodyHtml: string;
			photos: string[];
			subjects: SubjectFace[];
		};
		/** Whose journal it is: the editor saves there, and the photos are of them. */
		contact: { id: string; displayName: string };
		/** The day the entry is under, for the photos' alt text. */
		day: string;
		candidates: EditorProps['candidates'];
		tags: EditorProps['tags'];
		/** This entry is the one being edited — only one at a time. */
		editing: boolean;
		onEdit: () => void;
		onDoneEditing: () => void;
		/** The × was pressed; the page holds the removal back for an undo window. */
		onRemove: (event: SubmitEvent) => void;
	} = $props();

	const t = useI18n().t;

	// A private entry's title, text and photos stay blurred until asked for (docs/02 §2.10.1).
	const veil = useVeil();
	const veilId = $derived(`journal:${entry.id}`);
	const titleShown = $derived(entry.visibility !== 'private' || !veil.isVeiled(veilId));

	function startEdit() {
		if (entry.visibility === 'private') veil.revealForEdit(veilId);
		onEdit();
	}
</script>

<!-- Its id is where *On this day* lands (docs/02 §2.12.1). -->
<article id={journalEntryAnchor(entry.id)} class="scroll-mt-20 rounded-app bg-card p-5 shadow-card">
	<div class="mb-2 flex items-center gap-2">
		{#if entry.title && titleShown}
			<h3 class="font-medium text-fg">{entry.title}</h3>
		{/if}
		<!-- No kind chip here to hang the name off, so it says "by" and reads on its own. -->
		{#if entry.author}
			<span class="text-xs text-fg-subtle">
				{t('journal.by', { author: entry.author })}
			</span>
		{/if}
		{#if entry.visibility === 'private'}
			<PrivateMark {veilId} tone="pill" />
		{/if}
		<!-- 24 px drawn, a finger's square on a touch screen; the gap keeps the pencil
		     and the × from sharing one there (docs/05 §5.9). -->
		<div class="ml-auto flex items-center gap-2 pointer-coarse:gap-5">
			{#if entry.mine}
				<button
					type="button"
					class="tap-target grid size-6 place-items-center text-fg-subtle hover:text-fg"
					aria-label={t('journal.editEntry')}
					title={t('journal.editEntry')}
					onclick={() => (editing ? onDoneEditing() : startEdit())}
				>
					<Icon name="write" size={15} />
				</button>
			{/if}
			{#if entry.removable}
				<form method="POST" action="?/delete" onsubmit={onRemove}>
					<input type="hidden" name="id" value={entry.id} />
					<button
						type="submit"
						class="tap-target grid size-6 place-items-center text-fg-subtle hover:text-danger"
						aria-label={t('journal.deleteEntry')}
						title={t('journal.deleteEntry')}
					>
						<Icon name="remove" size={15} />
					</button>
				</form>
			{/if}
		</div>
	</div>
	<MomentWith others={othersThan(entry.subjects, contact.id)} />
	<!-- The entry and its editor glide into each other in place (docs/05 §5.11). -->
	<Swap when={editing}>
		<JournalEntryEditor contactId={contact.id} {entry} {candidates} {tags} onDone={onDoneEditing} />
		{#snippet otherwise()}
			<Veil id={veilId} isPrivate={entry.visibility === 'private'} label={t('privacy.veil.moment')}>
				{#snippet standIn()}
					{#if entry.title}
						<p class="mb-2 font-medium text-fg">{placeholderFor(entry.title)}</p>
					{/if}
					<p class="whitespace-pre-line text-fg">{placeholderFor(entry.bodyHtml)}</p>
				{/snippet}
				<!-- server-rendered, already-safe Markdown (docs/02 §2.5) -->
				<div class="note-body text-fg">{@html entry.bodyHtml}</div>
			</Veil>
		{/snippet}
	</Swap>

	<!-- While editing, the editor shows the photos. -->
	{#if entry.photos.length && !editing}
		<!-- The same veil as the text: one tap shows both. -->
		<Veil
			id={veilId}
			isPrivate={entry.visibility === 'private'}
			label={t('privacy.veil.photo')}
			photo
			class="mt-3 w-fit"
		>
			<div class="flex flex-wrap gap-2">
				{#each entry.photos as photoId (photoId)}
					<a
						href="/media/{photoId}"
						target="_blank"
						rel="noreferrer"
						class="block overflow-hidden rounded-app border border-border"
					>
						<img
							src="/media/{photoId}?thumb"
							alt={t('journal.photoAlt', { name: contact.displayName, day })}
							loading="lazy"
							class="h-28 w-28 object-cover transition-transform hover:scale-105"
						/>
					</a>
				{/each}
			</div>
		</Veil>
	{/if}
</article>
