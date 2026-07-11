<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const c = $derived(data.contact);

	// Group the (already newest-first) entries by their day for the timeline.
	const days = $derived.by(() => {
		const groups: { date: string; items: PageData['entries'] }[] = [];
		for (const e of data.entries) {
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

<main class="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-10">
	<a href="/contacts/{c.id}" class="text-sm text-fg-muted hover:text-fg">← {c.displayName}</a>

	<header class="flex items-center justify-between gap-4">
		<div class="flex items-center gap-3">
			<Avatar id={c.id} name={c.displayName} avatarPhotoId={c.avatarPhotoId} size={44} />
			<div>
				<h1 class="text-2xl font-semibold text-fg">Journal</h1>
				<p class="text-sm text-fg-muted">Moments in {c.displayName}’s life, day by day.</p>
			</div>
		</div>
		<button
			onclick={() => (composing = !composing)}
			class="rounded-app bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90"
		>
			{showForm ? 'Close' : 'New entry'}
		</button>
	</header>

	{#if showForm}
		<form
			method="POST"
			action="?/save"
			class="flex flex-col gap-3 rounded-app border border-border bg-card p-5"
		>
			{#if form?.journalError}
				<p class="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{form.journalError}</p>
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
			<div class="flex flex-wrap items-center gap-4 text-sm">
				<label class="flex items-center gap-1.5">
					<input type="radio" name="visibility" value="shared" checked /> Shared
				</label>
				<label class="flex items-center gap-1.5">
					<input type="radio" name="visibility" value="private" /> Private — only you
				</label>
				<button class="ml-auto rounded-app bg-primary px-4 py-2 font-medium text-primary-fg transition-opacity hover:opacity-90">
					Save entry
				</button>
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
						<article class="rounded-app border border-border bg-card p-5">
							<div class="mb-2 flex items-center gap-2">
								{#if entry.title}<h3 class="font-medium text-fg">{entry.title}</h3>{/if}
								{#if entry.visibility === 'private'}
									<span
										class="rounded-full px-2 py-0.5 text-xs"
										style="background:color-mix(in srgb, var(--ctp-mauve) 18%, transparent); color:var(--ctp-mauve)"
									>
										private
									</span>
								{/if}
								{#if entry.mine}
									<form method="POST" action="?/delete" class="ml-auto">
										<input type="hidden" name="id" value={entry.id} />
										<button
											class="text-fg-subtle hover:text-danger"
											aria-label="Delete entry"
											title="Delete entry"
										>
											×
										</button>
									</form>
								{/if}
							</div>
							<!-- server-rendered, already-safe Markdown (docs/02 §2.5) -->
							<div class="note-body text-fg">{@html entry.bodyHtml}</div>
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
