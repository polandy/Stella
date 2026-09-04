<script lang="ts">
	import AvatarUploader from '$lib/components/AvatarUploader.svelte';
	import EgoGraph from '$lib/components/EgoGraph.svelte';
	import InteractionTimeline from '$lib/components/InteractionTimeline.svelte';
	import JournalTimeline from '$lib/components/JournalTimeline.svelte';
	import { KIND_PRESENTATION } from '$lib/interactions/kinds';
	import { dayLabel } from '$lib/dates/labels';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const c = $derived(data.contact);
	// Today in the browser's zone, as the default day for a new interaction.
	const today = new Date().toLocaleDateString('en-CA');

	// Accent per relationship category, matching the design system (docs/05 §5.6).
	const categoryColor: Record<string, string> = {
		family: 'var(--ctp-green)',
		romantic: 'var(--ctp-pink)',
		social: 'var(--ctp-blue)',
		professional: 'var(--ctp-peach)',
		other: 'var(--fg-subtle)'
	};

	// One ego-graph node per connected person (a person may hold several relationship
	// types; the graph shows them once, keeping the first label).
	const egoNodes = $derived.by(() => {
		const seen = new Set<string>();
		const out: { id: string; name: string; label: string; category: string }[] = [];
		for (const r of data.relationships) {
			if (seen.has(r.otherContactId)) continue;
			seen.add(r.otherContactId);
			out.push({ id: r.otherContactId, name: r.otherDisplayName, label: r.label, category: r.category });
		}
		return out;
	});
</script>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
	<header class="flex items-center gap-4">
		<AvatarUploader contactId={c.id} name={c.displayName} avatarPhotoId={c.avatarPhotoId} size={64} />
		<div class="min-w-0 flex-1">
			<h1 class="truncate text-2xl font-semibold text-fg">{c.displayName}</h1>
			{#if c.description}<p class="truncate text-fg-muted">{c.description}</p>{/if}
			{#if c.visibility === 'private'}
				<span class="text-xs text-fg-subtle">Private — only you can see this contact</span>
			{/if}
			{#if data.lastContactedAt}
				<p class="text-xs text-fg-subtle" data-testid="last-contacted">
					Last contacted <time datetime={data.lastContactedAt}>{dayLabel(data.lastContactedAt)}</time>
				</p>
			{/if}
			{#if form?.avatarError}<p class="mt-1 text-xs text-danger">{form.avatarError}</p>{/if}
		</div>
		<a
			href="/contacts/{c.id}/journal"
			class="inline-flex shrink-0 items-center gap-1.5 rounded-app border border-border px-3 py-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
		>
			<span aria-hidden="true">📔</span> Journal
		</a>
	</header>

	<!-- Tags -->
	<section class="flex flex-wrap items-center gap-2">
		{#each data.tags as tag (tag.id)}
			<span
				class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm"
				style="background:color-mix(in srgb, var(--ctp-{tag.color}) 18%, transparent); color:var(--ctp-{tag.color})"
			>
				{tag.name}
				<form method="POST" action="?/removeTag" class="contents">
					<input type="hidden" name="tagId" value={tag.id} />
					<button class="opacity-70 hover:opacity-100" aria-label="Remove tag">×</button>
				</form>
			</span>
		{/each}

		<form method="POST" action="?/addTag" class="inline-flex items-center gap-1">
			<input
				name="name"
				placeholder="+ tag"
				class="w-24 rounded-full border border-border bg-bg px-3 py-1 text-sm text-fg"
			/>
			<select name="color" class="rounded-full border border-border bg-bg px-2 py-1 text-sm text-fg">
				{#each data.tagColors as color (color)}
					<option value={color}>{color}</option>
				{/each}
			</select>
			<button class="rounded-full border border-border px-2 py-1 text-sm text-fg-muted hover:text-fg">Add</button>
		</form>
	</section>
	{#if form?.tagError}
		<p class="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{form.tagError}</p>
	{/if}

	<!-- Circles (shared contexts) -->
	<section class="flex flex-col gap-3">
		<div class="flex items-center justify-between">
			<h2 class="text-sm font-medium text-fg-muted">Circles</h2>
			<a href="/circles" class="text-xs text-link hover:underline">All circles</a>
		</div>

		{#if data.circles.length}
			<ul class="flex flex-wrap gap-2">
				{#each data.circles as circle (circle.membershipId)}
					<li>
						<span class="inline-flex items-center gap-1.5 rounded-full border border-border py-1 pl-2.5 pr-1.5 text-sm">
							<span class="size-2 rounded-full" style="background:var(--ctp-{circle.color})"></span>
							<a href="/circles/{circle.circleId}" class="text-fg hover:underline">{circle.name}</a>
							{#if circle.role}<span class="text-xs text-fg-subtle">· {circle.role}</span>{/if}
							<form method="POST" action="?/leaveCircle" class="contents">
								<input type="hidden" name="circleId" value={circle.circleId} />
								<button class="opacity-70 hover:opacity-100" aria-label="Leave circle">×</button>
							</form>
						</span>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-fg-subtle">Not in any circle yet.</p>
		{/if}

		<form method="POST" action="?/joinCircle" class="flex flex-wrap items-end gap-2">
			{#if form?.circleError}
				<p class="w-full rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{form.circleError}</p>
			{/if}
			<input
				name="circleName"
				list="circle-names"
				placeholder="Join or create a circle…"
				class="flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg"
			/>
			<datalist id="circle-names">
				{#each data.circleNames as name (name)}<option value={name}></option>{/each}
			</datalist>
			<input name="role" placeholder="role (optional)" class="w-32 rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg" />
			<button class="rounded-app border border-border px-3 py-2 text-sm text-fg-muted hover:text-fg">Add</button>
		</form>
	</section>

	<!-- Contact details -->
	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-medium text-fg-muted">Contact details</h2>

		{#if data.fields.length > 0}
			<ul class="flex flex-col gap-1">
				{#each data.fields as f (f.id)}
					<li class="flex items-center gap-3 rounded-app border border-border bg-card px-3 py-2">
						<span class="w-16 shrink-0 text-xs uppercase tracking-wide text-fg-subtle">
							{f.label ?? f.kind}
						</span>
						{#if f.href}
							<a href={f.href} class="flex-1 truncate text-link hover:underline">{f.value}</a>
						{:else}
							<span class="flex-1 truncate text-fg">{f.value}</span>
						{/if}
						<form method="POST" action="?/removeField">
							<input type="hidden" name="fieldId" value={f.id} />
							<button class="text-fg-subtle hover:text-danger" title="Remove" aria-label="Remove field">×</button>
						</form>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-fg-subtle">No phone, email, or address yet.</p>
		{/if}

		<form method="POST" action="?/addField" class="flex flex-wrap items-end gap-2 rounded-app border border-dashed border-border p-4">
			{#if form?.fieldError}
				<p class="w-full rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{form.fieldError}</p>
			{/if}
			<select name="kind" class="rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg">
				{#each data.fieldKinds as kind (kind)}
					<option value={kind}>{kind}</option>
				{/each}
			</select>
			<input name="label" placeholder="Label (optional)" class="w-32 rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg" />
			<input name="value" placeholder="Value" class="flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg" />
			<button class="rounded-app bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90">Add</button>
		</form>
	</section>

	<!-- Dates -->
	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-medium text-fg-muted">Dates</h2>

		{#if data.derivedBirthday || data.estimatedBirthYear || data.dates.length > 0}
			<ul class="flex flex-col gap-1">
				{#if data.estimatedBirthYear}
					<li class="flex items-center gap-3 rounded-app border border-border bg-card px-3 py-2">
						<span class="w-24 shrink-0 text-xs uppercase tracking-wide text-fg-subtle">born</span>
						<span class="flex-1 truncate text-fg">around {data.estimatedBirthYear}</span>
						<span class="text-xs text-fg-subtle">estimated</span>
					</li>
				{/if}
				{#if data.derivedBirthday}
					<li class="flex items-center gap-3 rounded-app border border-border bg-card px-3 py-2">
						<span class="w-24 shrink-0 text-xs uppercase tracking-wide text-fg-subtle">birthday</span>
						<span class="flex-1 truncate text-fg">{dayLabel(data.derivedBirthday)}</span>
						<span class="text-xs text-fg-subtle">from the profile</span>
					</li>
				{/if}
				{#each data.dates as d (d.id)}
					<li class="flex items-center gap-3 rounded-app border border-border bg-card px-3 py-2">
						<span class="w-24 shrink-0 text-xs uppercase tracking-wide text-fg-subtle">
							{d.label ?? d.kind}
						</span>
						<span class="flex-1 truncate text-fg">{dayLabel(d.date)}</span>
						{#if !d.recursYearly}<span class="text-xs text-fg-subtle">once</span>{/if}
						{#if !d.remind}<span class="text-xs text-fg-subtle" title="Kept, but never surfaced on Home">muted</span>{/if}
						<form method="POST" action="?/removeDate">
							<input type="hidden" name="dateId" value={d.id} />
							<button class="text-fg-subtle hover:text-danger" title="Remove" aria-label="Remove date">×</button>
						</form>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-fg-subtle">No birthday or anniversary yet.</p>
		{/if}

		<form method="POST" action="?/addDate" class="flex flex-wrap items-end gap-2 rounded-app border border-dashed border-border p-4">
			{#if form?.dateError}
				<p class="w-full rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{form.dateError}</p>
			{/if}
			<select name="kind" class="rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg">
				{#each data.dateKinds as kind (kind)}
					<option value={kind}>{kind}</option>
				{/each}
			</select>
			<input type="date" name="date" required class="rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg" aria-label="Day" />
			<input name="label" placeholder="Name (for custom)" class="w-40 rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg" />
			<label class="flex items-center gap-1.5 text-sm text-fg-muted">
				<input type="checkbox" name="yearUnknown" /> Year unknown
			</label>
			<label class="flex items-center gap-1.5 text-sm text-fg-muted">
				<input type="checkbox" name="recursYearly" checked /> Every year
			</label>
			<label class="flex items-center gap-1.5 text-sm text-fg-muted">
				<input type="checkbox" name="remind" checked /> Show on Home
			</label>
			<button class="rounded-app bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90">Add</button>
		</form>
	</section>

	<!-- Relationships -->
	<section id="relationships" class="flex flex-col gap-3">
		<div class="flex items-center justify-between">
			<h2 class="text-sm font-medium text-fg-muted">Relationships</h2>
			<a
				href="/graph?center={c.id}"
				class="inline-flex items-center gap-1.5 rounded-app border border-border px-3 py-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
			>
				<span aria-hidden="true">🕸️</span> Explore connections
			</a>
		</div>

		{#if egoNodes.length > 0}
			<EgoGraph centerName={c.displayName} nodes={egoNodes} />
		{/if}

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
							<option value={other.id} selected={other.id === data.relateTo}>{other.displayName}</option>
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

	<!-- Interactions (docs/02 §2.6): the touchpoints "last contacted" is derived from -->
	<section id="interactions" class="flex flex-col gap-3">
		<h2 class="text-sm font-medium text-fg-muted">Interactions</h2>

		<InteractionTimeline items={data.interactions} />

		<form method="POST" action="?/logInteraction" class="flex flex-col gap-3 rounded-app border border-dashed border-border p-4">
			{#if form?.interactionError}
				<p class="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{form.interactionError}</p>
			{/if}
			<div class="flex flex-wrap items-end gap-2">
				<select name="kind" aria-label="Kind" class="rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg">
					{#each data.interactionKinds as kind (kind)}
						<option value={kind}>{KIND_PRESENTATION[kind].label}</option>
					{/each}
				</select>
				<input type="date" name="happenedAt" value={today} required aria-label="Day" class="rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg" />
				<input name="title" placeholder="What happened? (optional)" class="min-w-48 flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg" />
			</div>
			<textarea
				name="description"
				rows="2"
				placeholder="Details… (optional)"
				class="rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg"
			></textarea>
			{#if data.otherContacts.length > 0}
				<label class="flex flex-col gap-1 text-sm text-fg-muted">
					Who else was there?
					<select name="participants" multiple size="3" class="rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg">
						{#each data.otherContacts as other (other.id)}
							<option value={other.id}>{other.displayName}</option>
						{/each}
					</select>
				</label>
			{/if}
			<div class="flex flex-wrap items-center gap-4 text-sm">
				<label class="flex items-center gap-1.5">
					<input type="radio" name="visibility" value="shared" checked /> Shared
				</label>
				<label class="flex items-center gap-1.5">
					<input type="radio" name="visibility" value="private" /> Private
				</label>
				<button class="ml-auto rounded-app bg-primary px-4 py-2 font-medium text-primary-fg transition-opacity hover:opacity-90">
					Log interaction
				</button>
			</div>
		</form>
	</section>

	<!-- Journal (inline timeline, week by week; writing with photos lives on the full page) -->
	<section class="flex flex-col gap-3">
		<div class="flex items-center justify-between">
			<h2 class="text-sm font-medium text-fg-muted">Journal</h2>
			<a
				href="/contacts/{c.id}/journal"
				class="inline-flex items-center gap-1.5 rounded-app border border-border px-3 py-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
			>
				<span aria-hidden="true">✎</span> Write entry
			</a>
		</div>
		{#key c.id}
			<JournalTimeline contactId={c.id} initial={data.journal} />
		{/key}
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
