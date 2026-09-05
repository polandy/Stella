<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { processImage } from '$lib/image/process-image';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey as buildKey } from '$lib/undo/keys';
	import { submitAction } from '$lib/undo/submit-action';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const c = $derived(data.contact);

	// Selected images for the entry being composed (processed in the browser on submit).
	let picked = $state<File[]>([]);
	let uploading = $state(false);
	let uploadError = $state<string | null>(null);

	function onFiles(event: Event) {
		picked = Array.from((event.currentTarget as HTMLInputElement).files ?? []);
	}

	// Progressive enhancement: with no images, let the form post natively (text-only). With
	// images, process them client-side (downscale + EXIF strip) and post everything via fetch.
	async function onSubmit(event: SubmitEvent) {
		if (picked.length === 0) return; // native submit handles the text
		event.preventDefault();
		const formEl = event.currentTarget as HTMLFormElement;
		uploading = true;
		uploadError = null;
		try {
			const body = new FormData(formEl);
			for (const file of picked) {
				const { image, thumb, width, height } = await processImage(file);
				body.append('image', image, 'photo.jpg');
				body.append('thumb', thumb, 'thumb.jpg');
				body.append('width', String(width));
				body.append('height', String(height));
			}
			const res = await fetch(`/contacts/${c.id}/journal?/save`, { method: 'POST', body });
			if (!res.ok) throw new Error();
			formEl.reset();
			picked = [];
			composing = false;
			await invalidateAll();
		} catch {
			uploadError = 'Could not save. Try standard JPEG or PNG images.';
		} finally {
			uploading = false;
		}
	}

	// Removing is held back for an undo window (docs/02 §2.23), same as on the story.
	const removals = useRemovals();
	const removalKey = (entry: { id: string }) => buildKey('journal', entry.id);
	function deferRemoval(event: SubmitEvent, entry: { id: string }) {
		event.preventDefault();
		const body = new FormData(event.currentTarget as HTMLFormElement);
		removals.remove({
			key: removalKey(entry),
			label: 'Entry removed',
			commit: async () => {
				await submitAction(fetch, '?/delete', body);
				await invalidateAll();
			}
		});
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
		return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
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

<svelte:head><title>{c.displayName}’s journal · Stella</title></svelte:head>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
	<header class="flex items-center justify-between gap-4">
		<div class="flex items-center gap-3">
			<Avatar id={c.id} name={c.displayName} avatarPhotoId={c.avatarPhotoId} size={44} />
			<div>
				<h1 class="text-2xl font-semibold text-fg">Journal</h1>
				<p class="text-sm text-fg-muted">Moments in {c.displayName}’s life, day by day.</p>
			</div>
		</div>
		<Button variant="primary" type="button" onclick={() => (composing = !composing)}>
			{showForm ? 'Close' : 'New entry'}
		</Button>
	</header>

	{#if showForm}
		<form
			method="POST"
			action="?/save"
			enctype="multipart/form-data"
			onsubmit={onSubmit}
			class="flex flex-col gap-3 rounded-app bg-card p-5 shadow-card"
		>
			{#if form?.journalError}
				<p class="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{form.journalError}</p>
			{/if}
			{#if uploadError}
				<p class="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{uploadError}</p>
			{/if}
			<div class="flex flex-wrap items-end gap-3">
				<label class="flex flex-col gap-1 text-sm">
					<span class="text-fg-muted">Day</span>
					<input
						type="date"
						name="entryDate"
						value={data.today}
						max={data.today}
						required
						class="rounded-md border border-border bg-bg px-3 py-2 text-fg"
					/>
				</label>
				<label class="flex flex-1 flex-col gap-1 text-sm">
					<span class="text-fg-muted">Title (optional)</span>
					<input
						name="title"
						placeholder="e.g. First steps"
						class="rounded-md border border-border bg-bg px-3 py-2 text-fg"
					/>
				</label>
			</div>
			<textarea
				name="body"
				rows="5"
				required
				placeholder="What happened today? (Markdown supported)"
				class="rounded-md border border-border bg-bg px-3 py-2 text-fg"
			></textarea>
			<div class="flex flex-wrap items-center gap-3">
				<label class="inline-flex cursor-pointer items-center gap-2 rounded-app border border-border px-3 py-2 text-sm text-fg-muted hover:text-fg">
					<Icon name="photo" size={15} /> Add photos
					<input type="file" accept="image/*" multiple onchange={onFiles} class="hidden" />
				</label>
				{#if picked.length}
					<span class="text-sm text-fg-subtle">{picked.length} photo{picked.length > 1 ? 's' : ''} ready</span>
				{/if}
			</div>
			<div class="flex flex-wrap items-center gap-4 text-sm">
				<label class="flex items-center gap-1.5">
					<input type="radio" name="visibility" value="shared" checked /> Shared
				</label>
				<label class="flex items-center gap-1.5">
					<input type="radio" name="visibility" value="private" /> Private — only you
				</label>
				<Button variant="primary" disabled={uploading} class="ml-auto">
					{uploading ? 'Saving…' : 'Save entry'}
				</Button>
			</div>
			<p class="text-xs text-fg-subtle">
				One entry per day — saving the same day again updates it. Private and shared are separate.
			</p>
		</form>
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
								{#if entry.author}<span class="text-xs text-fg-subtle">by {entry.author}</span>{/if}
								{#if entry.visibility === 'private'}
									<span
										class="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary"
									>
										<Icon name="private" size={11} />private
									</span>
								{/if}
								{#if entry.mine}
									<form
										method="POST"
										action="?/delete"
										class="ml-auto"
										onsubmit={(event) => deferRemoval(event, entry)}
									>
										<input type="hidden" name="id" value={entry.id} />
										<button
											class="text-fg-subtle hover:text-danger"
											aria-label="Delete entry"
											title="Delete entry"
										>
											<Icon name="remove" size={15} />
										</button>
									</form>
								{/if}
							</div>
							<!-- server-rendered, already-safe Markdown (docs/02 §2.5) -->
							<div class="note-body text-fg">{@html entry.bodyHtml}</div>

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
												alt="{c.displayName}, {day.date}"
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
		<div class="rounded-app border border-dashed border-border p-10 text-center">
			<p class="text-fg-muted">No journal entries yet.</p>
			<p class="mt-1 text-sm text-fg-subtle">
				Capture {c.displayName}’s first moment — a milestone, a funny quote, a good day.
			</p>
		</div>
	{/if}
</main>
