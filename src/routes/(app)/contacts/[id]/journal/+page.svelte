<script lang="ts">
	import { deserialize, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import DateField from '$lib/components/DateField.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import MentionTextarea from '$lib/components/MentionTextarea.svelte';
	import { asTyped } from '$lib/mentions/picks';
	import KeptItem from '$lib/components/KeptItem.svelte';
	import { processImage } from '$lib/image/process-image';
	import { keepable } from '$lib/pwa/keepable';
	import { isKept, type KeptOf, type KeptPhoto } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { ulid } from 'ulid';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey as buildKey } from '$lib/undo/keys';
	import { submitAction } from '$lib/undo/submit-action';
	import type { ActionData, PageData } from './$types';
	import { useI18n } from '$lib/i18n/context.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const i18n = useI18n();
	const t = i18n.t;

	const c = $derived(data.contact);

	// The entry's audience narrows whom the @-picker offers (docs/02 §2.20.1).
	let entryVisibility = $state<'shared' | 'private'>('shared');
	// A typed @Thomas that could be several people keeps saving off until one is picked.
	let entryUnclear = $state(false);

	// Selected images for the entry being composed (processed in the browser on submit).
	let picked = $state<File[]>([]);
	let uploading = $state(false);
	let uploadError = $state<string | null>(null);
	let composeForm: HTMLFormElement | undefined = $state();

	function onFiles(event: Event) {
		picked = Array.from((event.currentTarget as HTMLInputElement).files ?? []);
	}

	/*
	 * An entry is saved as a command through the outbox, in reach or not (docs/concepts/
	 * offline-capture.md §4.1, §8 #10): its photos are processed first (downscaled, location
	 * stripped) and follow it. Kept on the device when Stella cannot take it, it shows above the
	 * timeline until it is sent. Without JavaScript the form posts to its action as before.
	 */
	const keptEntries = $derived(
		outbox.mine.filter(
			(item): item is KeptOf<'journal.write'> =>
				isKept(item, 'journal.write') && item.command.payload.contactId === c.id
		)
	);
	function doneComposing() {
		composeForm?.reset();
		picked = [];
		entryVisibility = 'shared';
		composing = false;
	}
	const journalForm = $derived(
		keepable(
			{
				toCommand: (form, id) => {
					const body = String(form.get('body') ?? '').trim();
					const entryDate = String(form.get('entryDate') ?? '');
					if (!body || !entryDate) return null;
					return {
						id,
						type: 'journal.write',
						payload: {
							contactId: c.id,
							entryDate,
							title: String(form.get('title') ?? '').trim() || null,
							body,
							visibility: form.get('visibility') === 'private' ? 'private' : 'shared'
						},
						issuedAt: Date.now()
					};
				},
				about: c.displayName,
				errorKey: 'journalError',
				photos: async () => {
					uploading = true;
					uploadError = null;
					try {
						const photos: KeptPhoto[] = [];
						for (const file of picked) photos.push({ id: ulid(), ...(await processImage(file)) });
						return photos;
					} catch {
						uploadError = t('journal.uploadFailed');
						return null;
					} finally {
						uploading = false;
					}
				},
				onApplied: doneComposing,
				onKept: doneComposing
			},
			() => {}
		)
	);

	// Removing is held back for an undo window (docs/02 §2.23), same as on the story.
	const removals = useRemovals();
	const removalKey = (entry: { id: string }) => buildKey('journal', entry.id);
	function deferRemoval(event: SubmitEvent, entry: { id: string }) {
		event.preventDefault();
		const body = new FormData(event.currentTarget as HTMLFormElement);
		removals.remove({
			key: removalKey(entry),
			label: t('journal.entryRemoved'),
			commit: async () => {
				await submitAction(fetch, '?/delete', body);
				await invalidateAll();
			}
		});
	}

	// Editing an entry in place: only one at a time, prefilled from the entry being edited.
	let editingId = $state<string | null>(null);
	let editTitle = $state('');
	let editBody = $state('');
	let editSaving = $state(false);
	let editUnclear = $state(false);
	let editError = $state<string | null>(null);

	function startEdit(entry: PageData['entries'][number]) {
		editingId = entry.id;
		editTitle = entry.title ?? '';
		editBody = entry.bodyForEdit;
		editError = null;
	}
	function cancelEdit() {
		editingId = null;
		editError = null;
	}
	async function onEditSubmit(event: SubmitEvent) {
		event.preventDefault();
		const formEl = event.currentTarget as HTMLFormElement;
		editSaving = true;
		editError = null;
		try {
			const res = await fetch(`/contacts/${c.id}/journal?/edit`, {
				method: 'POST',
				body: new FormData(formEl),
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result = deserialize(await res.text());
			// A refusal says why — a namesake to pick, say (docs/02 §2.2.3) — and keeps the text.
			if (result.type === 'failure') {
				editError = (result.data?.journalError as string | undefined) ?? t('journal.editSaveFailed');
				return;
			}
			if (result.type === 'error') throw new Error();
			editingId = null;
			await invalidateAll();
		} catch {
			editError = t('journal.editSaveFailed');
		} finally {
			editSaving = false;
		}
	}

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

	function prettyDate(iso: string): string {
		const [y, m, d] = iso.split('-').map(Number);
		return new Date(y, m - 1, d).toLocaleDateString(i18n.intlLocale, {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
	}

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

	{#if showForm}
		<form
			method="POST"
			action="?/save"
			enctype="multipart/form-data"
			use:enhance={journalForm}
			bind:this={composeForm}
			class="flex flex-col gap-3 rounded-app bg-card p-5 shadow-card"
		>
			{#if form?.journalError}
				<p class="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{form.journalError}</p>
			{/if}
			{#if uploadError}
				<p class="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{uploadError}</p>
			{/if}
			<div class="flex flex-wrap items-end gap-3">
				<div class="flex flex-col gap-1 text-sm">
					<span class="text-fg-muted">{t('journal.day')}</span>
					<DateField
						name="entryDate"
						value={data.today}
						max={data.today}
						required
						label={t('journal.day')}
					/>
				</div>
				<label class="flex flex-1 flex-col gap-1 text-sm">
					<span class="text-fg-muted">{t('journal.titleOptional')}</span>
					<input
						name="title"
						placeholder={t('journal.titlePlaceholder')}
						class="rounded-md border border-border bg-bg px-3 py-2 text-fg"
					/>
				</label>
			</div>
			<MentionTextarea
				name="body"
				label={t('journal.entry')}
				rows={5}
				required
				candidates={data.candidates}
				visibility={entryVisibility}
				bind:unclear={entryUnclear}
				placeholder={t('journal.bodyPlaceholder')}
				class="w-full rounded-md border border-border bg-bg px-3 py-2 text-fg"
			/>
			<div class="flex flex-wrap items-center gap-3">
				<label class="inline-flex cursor-pointer items-center gap-2 rounded-app border border-border px-3 py-2 text-sm text-fg-muted hover:text-fg">
					<Icon name="photo" size={15} /> {t('journal.addPhotos')}
					<input type="file" accept="image/*" multiple onchange={onFiles} class="hidden" />
				</label>
				{#if picked.length}
					<span class="text-sm text-fg-subtle">
						{t('journal.photosReady', { count: picked.length })}
					</span>
				{/if}
			</div>
			<div class="flex flex-wrap items-center gap-4 text-sm">
				<label class="flex items-center gap-1.5">
					<input type="radio" name="visibility" value="shared" bind:group={entryVisibility} />
					{t('common.shared')}
				</label>
				<label class="flex items-center gap-1.5">
					<input type="radio" name="visibility" value="private" bind:group={entryVisibility} />
					{t('journal.privateOnlyYou')}
				</label>
				<Button variant="primary" disabled={uploading || entryUnclear} class="ml-auto">
					{uploading ? t('common.saving') : t('journal.saveEntry')}
				</Button>
			</div>
			<p class="text-xs text-fg-subtle">
				{t('journal.oneEntryPerDay')}
			</p>
		</form>
	{/if}

	{#if keptEntries.length > 0}
		<ul class="flex flex-col gap-2" data-testid="kept-entries">
			{#each keptEntries as item (item.command.id)}
				<li>
					<KeptItem {item}>
						{#snippet meta()}<span>· {prettyDate(item.command.payload.entryDate)}</span>{/snippet}
						{#if item.command.payload.title}<p class="mt-1 font-medium text-fg">{item.command.payload.title}</p>{/if}
						<p class="mt-1 whitespace-pre-line text-fg">{asTyped(item.command.payload.body, [...data.candidates, data.contact])}</p>
					</KeptItem>
				</li>
			{/each}
		</ul>
	{/if}

	{#if days.length}
		<ol class="flex flex-col gap-8">
			{#each days as day (day.date)}
				<li class="flex flex-col gap-3">
					<div class="flex items-center gap-3">
						<h2 class="text-sm font-semibold uppercase tracking-wide text-fg-subtle">
							{prettyDate(day.date)}
						</h2>
						<span class="h-px flex-1 bg-border"></span>
					</div>

					{#each day.items as entry (entry.id)}
						<article class="rounded-app bg-card p-5 shadow-card">
							<div class="mb-2 flex items-center gap-2">
								{#if entry.title}<h3 class="font-medium text-fg">{entry.title}</h3>{/if}
								<!-- No kind chip here to hang the name off, so it says "by" and reads on its own. -->
								{#if entry.author}
									<span class="text-xs text-fg-subtle">
										{t('journal.by', { author: entry.author })}
									</span>
								{/if}
								{#if entry.visibility === 'private'}
									<span
										class="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary"
									>
										<Icon name="private" size={11} />{t('common.privateInline')}
									</span>
								{/if}
								{#if entry.mine}
									<div class="ml-auto flex items-center gap-2">
										<button
											type="button"
											class="text-fg-subtle hover:text-fg"
											aria-label={t('journal.editEntry')}
											title={t('journal.editEntry')}
											onclick={() => (editingId === entry.id ? cancelEdit() : startEdit(entry))}
										>
											<Icon name="write" size={15} />
										</button>
										<form
											method="POST"
											action="?/delete"
											onsubmit={(event) => deferRemoval(event, entry)}
										>
											<input type="hidden" name="id" value={entry.id} />
											<button
												class="text-fg-subtle hover:text-danger"
												aria-label={t('journal.deleteEntry')}
												title={t('journal.deleteEntry')}
											>
												<Icon name="remove" size={15} />
											</button>
										</form>
									</div>
								{/if}
							</div>
							{#if editingId === entry.id}
								<form
									method="POST"
									action="?/edit"
									onsubmit={onEditSubmit}
									class="flex flex-col gap-3"
								>
									<input type="hidden" name="id" value={entry.id} />
									{#if editError}
										<p class="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{editError}</p>
									{/if}
									<label class="flex flex-col gap-1 text-sm">
										<span class="text-fg-muted">{t('journal.titleOptional')}</span>
										<input
											name="title"
											bind:value={editTitle}
											placeholder={t('journal.titlePlaceholder')}
											class="rounded-md border border-border bg-bg px-3 py-2 text-fg"
										/>
									</label>
									<MentionTextarea
										name="body"
										label={t('journal.entry')}
										rows={5}
										required
										bind:value={editBody}
										bind:unclear={editUnclear}
										names={entry.mentionNames}
										candidates={data.candidates}
										visibility={entry.visibility}
										placeholder={t('journal.bodyPlaceholder')}
										class="w-full rounded-md border border-border bg-bg px-3 py-2 text-fg"
									/>
									<div class="flex items-center gap-3">
										<Button variant="primary" disabled={editSaving || editUnclear}>
											{editSaving ? t('common.saving') : t('journal.saveChanges')}
										</Button>
										<Button variant="ghost" type="button" onclick={cancelEdit}>
											{t('common.cancel')}
										</Button>
									</div>
								</form>
							{:else}
								<!-- server-rendered, already-safe Markdown (docs/02 §2.5) -->
								<div class="note-body text-fg">{@html entry.bodyHtml}</div>
							{/if}

							{#if entry.photos.length}
								<div class="mt-3 flex flex-wrap gap-2">
									{#each entry.photos as photoId (photoId)}
										<a
											href="/media/{photoId}"
											target="_blank"
											rel="noreferrer"
											class="block overflow-hidden rounded-app border border-border"
										>
											<img
												src="/media/{photoId}?thumb"
												alt={t('journal.photoAlt', { name: c.displayName, day: day.date })}
												loading="lazy"
												class="h-28 w-28 object-cover transition-transform hover:scale-105"
											/>
										</a>
									{/each}
								</div>
							{/if}
						</article>
					{/each}
				</li>
			{/each}
		</ol>
	{:else}
		<EmptyState icon="journal" title={t('journal.empty.title')} hint={t('journal.empty.hint', { name: c.displayName })}>
			<!-- With the form already open above, a second way to open it would only distract. -->
			{#if !showForm}
				<Button variant="primary" icon="write" type="button" onclick={() => (composing = true)}>{t('journal.empty.write')}</Button>
			{/if}
		</EmptyState>
	{/if}
</main>
