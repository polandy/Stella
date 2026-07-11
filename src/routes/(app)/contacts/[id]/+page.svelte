<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const c = $derived(data.contact);

	// Accent per relationship category, matching the design system (docs/05 §5.6).
	const categoryColor: Record<string, string> = {
		family: 'var(--ctp-green)',
		romantic: 'var(--ctp-pink)',
		social: 'var(--ctp-blue)',
		professional: 'var(--ctp-peach)',
		other: 'var(--fg-subtle)'
	};
</script>

<main class="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-10">
	<a href="/contacts" class="text-sm text-fg-muted hover:text-fg">← Contacts</a>

	<header class="flex items-center gap-4">
		<span class="grid size-16 shrink-0 place-items-center rounded-full bg-bg-sunken text-2xl font-medium text-fg-muted">
			{c.displayName.slice(0, 1).toUpperCase()}
		</span>
		<div class="min-w-0">
			<h1 class="truncate text-2xl font-semibold text-fg">{c.displayName}</h1>
			{#if c.description}<p class="truncate text-fg-muted">{c.description}</p>{/if}
			{#if c.visibility === 'private'}
				<span class="text-xs text-fg-subtle">Private — only you can see this contact</span>
			{/if}
		</div>
	</header>

	<!-- Relationships -->
	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-medium text-fg-muted">Relationships</h2>

		{#if data.relationships.length > 0}
			<ul class="flex flex-col gap-1">
				{#each data.relationships as rel (rel.id)}
					<li class="flex items-center gap-3 rounded-app border border-border bg-card px-3 py-2.5">
						<span class="size-2 shrink-0 rounded-full" style="background:{categoryColor[rel.category]}"></span>
						<span class="text-sm text-fg-muted">{rel.label}</span>
						<a href="/contacts/{rel.otherContactId}" class="font-medium text-fg hover:underline">
							{rel.otherDisplayName}
						</a>
						{#if rel.description}<span class="truncate text-sm text-fg-subtle">· {rel.description}</span>{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-fg-subtle">No relationships yet.</p>
		{/if}

		<!-- Add relationship -->
		{#if data.otherContacts.length > 0}
			<form
				method="POST"
				action="?/addRelationship"
				class="mt-2 flex flex-wrap items-end gap-3 rounded-app border border-dashed border-border p-4"
			>
				{#if form?.error}
					<p class="w-full rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{form.error}</p>
				{/if}
				<label class="flex flex-1 flex-col gap-1 text-sm">
					<span class="text-fg-muted">{c.displayName} is…</span>
					<select name="typeId" class="rounded-md border border-border bg-bg px-3 py-2 text-fg">
						{#each data.relationshipTypes as type (type.id)}
							<option value={type.id}>{type.forwardLabel}</option>
						{/each}
					</select>
				</label>
				<label class="flex flex-1 flex-col gap-1 text-sm">
					<span class="text-fg-muted">Person</span>
					<select name="targetId" class="rounded-md border border-border bg-bg px-3 py-2 text-fg">
						{#each data.otherContacts as other (other.id)}
							<option value={other.id}>{other.displayName}</option>
						{/each}
					</select>
				</label>
				<button class="rounded-app bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90">
					Add
				</button>
			</form>
		{/if}
	</section>

	<!-- Notes -->
	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-medium text-fg-muted">Notes</h2>

		{#if data.notes.length > 0}
			<ul class="flex flex-col gap-2">
				{#each data.notes as note (note.id)}
					<li class="rounded-app border border-border bg-card p-4">
						<div class="mb-1 flex items-center gap-2">
							{#if note.isPinned}<span class="text-xs text-primary">★ pinned</span>{/if}
							{#if note.title}<span class="font-medium text-fg">{note.title}</span>{/if}
							{#if note.visibility === 'private'}
								<span class="ml-auto text-xs text-fg-subtle">private</span>
							{/if}
						</div>
						<!-- server-rendered, already-safe Markdown (docs/02 §2.5) -->
						<div class="note-body text-fg">{@html note.bodyHtml}</div>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-fg-subtle">No notes yet.</p>
		{/if}

		<form method="POST" action="?/addNote" class="flex flex-col gap-3 rounded-app border border-dashed border-border p-4">
			{#if form?.noteError}
				<p class="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{form.noteError}</p>
			{/if}
			<textarea
				name="body"
				rows="3"
				placeholder="Write a note… (Markdown supported)"
				class="rounded-md border border-border bg-bg px-3 py-2 text-fg"
			></textarea>
			<div class="flex flex-wrap items-center gap-4 text-sm">
				<label class="flex items-center gap-1.5"><input type="checkbox" name="isPinned" /> Pin</label>
				<label class="flex items-center gap-1.5">
					<input type="radio" name="visibility" value="shared" checked /> Shared
				</label>
				<label class="flex items-center gap-1.5">
					<input type="radio" name="visibility" value="private" /> Private
				</label>
				<button class="ml-auto rounded-app bg-primary px-4 py-2 font-medium text-primary-fg transition-opacity hover:opacity-90">
					Add note
				</button>
			</div>
		</form>
	</section>

	<!-- How you met -->
	<section class="rounded-app border border-border bg-card p-6">
		<h2 class="mb-3 text-sm font-medium text-fg-muted">How you met</h2>
		{#if c.howWeMet || c.metPlace || c.metDate}
			<p class="text-fg">
				{c.howWeMet ?? ''}{#if c.metPlace}<span class="text-fg-muted"> · {c.metPlace}</span>{/if}{#if c.metDate}<span class="text-fg-muted"> · {c.metDate}</span>{/if}
			</p>
		{:else}
			<p class="text-fg-subtle">Not recorded yet.</p>
		{/if}
	</section>
</main>
