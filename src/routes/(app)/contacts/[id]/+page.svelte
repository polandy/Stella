<script lang="ts">
	import AvatarUploader from '$lib/components/AvatarUploader.svelte';
	import Button from '$lib/components/Button.svelte';
	import EgoGraph from '$lib/components/EgoGraph.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Section from '$lib/components/Section.svelte';
	import { enhance } from '$app/forms';
	import RemoveButton from '$lib/components/RemoveButton.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey, type RemovalKind } from '$lib/undo/keys';
	import { savedEnhance } from '$lib/undo/saved';
	import StoryTimeline from '$lib/components/StoryTimeline.svelte';
	import { dayLabel } from '$lib/dates/labels';
	import { accentChipStyle, accentDotStyle, categoryVar } from '$lib/design/tokens';
	import { KIND_PRESENTATION } from '$lib/interactions/kinds';
	import { untrack } from 'svelte';
	import type { ActionData, PageData } from './$types';

	/*
	 * A person's page (docs/05 §5.5): who they are on the left, what has happened on the right.
	 * Every form is closed until asked for, so the page reads as a person rather than as a stack
	 * of empty inputs. Below `md` the two columns stack with the story first — that is what you
	 * open a person for — and the profile follows underneath.
	 */
	let { data, form }: { data: PageData; form: ActionData } = $props();
	const c = $derived(data.contact);
	// Today in the browser's zone, as the default day for a new interaction.
	const today = new Date().toLocaleDateString('en-CA');

	/** One class for every text input on the page, so they cannot drift apart. */
	const INPUT =
		'rounded-control border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle';

	type Tab = 'story' | 'people' | 'notes';
	// Arriving with `?relate=` (a moment's hint, or quick-add's "link as relative") lands
	// straight on the relationship editor, prefilled — otherwise the hint would be a dead end.
	let tab = $state<Tab>(untrack(() => data.relateTo) ? 'people' : 'story');
	let relateOpen = $state(untrack(() => data.relateTo) !== null);
	// The hero's "Log contact" opens the story section's form; the section owns the state.
	let logOpen = $state(false);
	let showMap = $state(false);

	/*
	 * Counts are shown where they are exact. The story is paged, so its tab carries no number
	 * rather than one that quietly means "as much as we have fetched".
	 */
	const tabs: { id: Tab; label: string; count?: number }[] = $derived([
		{ id: 'story', label: 'Story' },
		{ id: 'people', label: 'People', count: data.relationships.length },
		{ id: 'notes', label: 'Notes', count: data.notes.length }
	]);

	function logContact() {
		tab = 'story';
		logOpen = true;
	}

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

	/** How this person came into the household's life, as one line, or null. */
	const metLine = $derived.by(() => {
		const parts = [c.howWeMet, c.metPlace, c.metDate].filter(Boolean);
		return parts.length > 0 ? parts.join(' · ') : null;
	});

	// A row on its way out (docs/02 §2.23) is gone from the list while its undo window is open,
	// and back in it the moment Undo is pressed. The counts follow, so a section never says two
	// tags over one chip.
	const removals = useRemovals();
	const shown = <T extends { id: string }>(kind: RemovalKind, rows: T[]) =>
		rows.filter((row) => !removals.isPending(removalKey(kind, row.id)));
	const visibleFields = $derived(shown('field', data.fields));
	const visibleDates = $derived(shown('date', data.dates));
	const visibleTags = $derived(shown('tag', data.tags));
	const visibleCircles = $derived(
		data.circles.filter((circle) => !removals.isPending(removalKey('membership', circle.membershipId)))
	);
	// Saving through `enhance` keeps the page — and with it any open undo window — alive, so
	// each section closes itself here instead of on the reload a redirect used to cause.
	// Logging a touchpoint is the exception: the story timeline owns its paged list, and only
	// a fresh page gives it the new item, so that form still posts natively.
	let openSection = $state({ contact: false, dates: false, circles: false, tags: false, note: false });
	type SectionName = keyof typeof openSection;
	const saved = (name: SectionName) => savedEnhance(removals, () => (openSection[name] = false));
	// Relationships keep their own open state: the quick-add flow opens that section by URL.
	const savedRelationship = savedEnhance(removals, () => (relateOpen = false));
</script>

<svelte:head><title>{c.displayName} · Stella</title></svelte:head>

<main class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
	<!-- Hero: who this is, when you last spoke, and the two things you came to do -->
	<header class="flex flex-wrap items-start gap-4">
		<AvatarUploader contactId={c.id} name={c.displayName} avatarPhotoId={c.avatarPhotoId} size={72} />
		<div class="min-w-0 flex-1">
			<h1 class="truncate text-2xl font-semibold tracking-tight text-fg">{c.displayName}</h1>
			{#if c.description}<p class="text-fg-muted">{c.description}</p>{/if}

			<div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-subtle">
				{#if data.lastContactedAt}
					<span data-testid="last-contacted">
						Last contact
						<time datetime={data.lastContactedAt} class="font-medium text-fg-muted">
							{dayLabel(data.lastContactedAt)}
						</time>
					</span>
				{:else}
					<span data-testid="last-contacted">No contact logged yet</span>
				{/if}
				{#if metLine}<span>Met <span class="font-medium text-fg-muted">{metLine}</span></span>{/if}
				{#if c.visibility === 'private'}
					<span class="inline-flex items-center gap-1" title="Only you can see this contact">
						<Icon name="private" size={11} />Private
					</span>
				{/if}
			</div>
			{#if form?.avatarError}<p class="mt-1 text-xs text-danger">{form.avatarError}</p>{/if}
		</div>

		<div class="flex w-full gap-2 sm:w-auto">
			<Button variant="primary" icon="write" href="/contacts/{c.id}/journal" class="flex-1 sm:flex-none">
				Write
			</Button>
			<Button icon="met" type="button" onclick={logContact} class="flex-1 sm:flex-none">
				Log contact
			</Button>
		</div>
	</header>

	<div class="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)] lg:items-start">
		<!-- Profile. Second on a phone: the story is why you opened the page. -->
		<div class="order-2 flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:order-1">
			<Section title="Contact" addLabel="Add" error={form?.fieldError ?? null} bind:open={openSection.contact}>
				{#if visibleFields.length > 0}
					<dl class="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
						{#each visibleFields as f (f.id)}
							<dt class="truncate text-fg-subtle">{f.label ?? f.kind}</dt>
							<dd class="flex min-w-0 items-center gap-2">
								{#if f.href}
									<a href={f.href} class="truncate text-link hover:underline">{f.value}</a>
								{:else}
									<span class="truncate text-fg">{f.value}</span>
								{/if}
								<RemoveButton
									kind="field"
									id={f.id}
									action="?/removeField"
									fields={{ fieldId: f.id }}
									label="Remove {f.label ?? f.kind}"
									removed="Contact detail removed"
									class="ml-auto"
								/>
							</dd>
						{/each}
					</dl>
				{:else}
					<p class="text-sm text-fg-subtle">No phone, email, or address yet.</p>
				{/if}

				{#snippet editor()}
					<form method="POST" action="?/addField" use:enhance={saved('contact')} class="flex flex-wrap items-end gap-2">
						<select name="kind" aria-label="Kind" class={INPUT}>
							{#each data.fieldKinds as kind (kind)}<option value={kind}>{kind}</option>{/each}
						</select>
						<input name="label" placeholder="Label (optional)" class="w-28 {INPUT}" />
						<input name="value" placeholder="Value" required class="min-w-40 flex-1 {INPUT}" />
						<Button variant="primary" size="sm">Add</Button>
					</form>
				{/snippet}
			</Section>

			<Section title="Dates" addLabel="Add" error={form?.dateError ?? null} bind:open={openSection.dates}>
				{#if data.derivedBirthday || data.estimatedBirthYear || visibleDates.length > 0}
					<ul class="flex flex-col gap-1.5 text-sm">
						{#if data.estimatedBirthYear}
							<li class="flex items-center gap-3">
								<span class="w-20 shrink-0 text-fg-subtle">born</span>
								<span class="flex-1 truncate text-fg">around {data.estimatedBirthYear}</span>
								<span class="text-xs text-fg-subtle">estimated</span>
							</li>
						{/if}
						{#if data.derivedBirthday}
							<li class="flex items-center gap-3">
								<span class="w-20 shrink-0 text-fg-subtle">birthday</span>
								<span class="flex-1 truncate text-fg">{dayLabel(data.derivedBirthday)}</span>
								<span class="text-xs text-fg-subtle">from the profile</span>
							</li>
						{/if}
						{#each visibleDates as d (d.id)}
							<li class="flex items-center gap-3">
								<span class="w-20 shrink-0 truncate text-fg-subtle">{d.label ?? d.kind}</span>
								<span class="flex-1 truncate text-fg">{dayLabel(d.date)}</span>
								{#if !d.recursYearly}<span class="text-xs text-fg-subtle">once</span>{/if}
								{#if !d.remind}
									<span class="text-xs text-fg-subtle" title="Kept, but never surfaced on Home">
										muted
									</span>
								{/if}
								<RemoveButton
									kind="date"
									id={d.id}
									action="?/removeDate"
									fields={{ dateId: d.id }}
									label="Remove {d.label ?? d.kind}"
									removed="Date removed"
								/>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-sm text-fg-subtle">No birthday or anniversary yet.</p>
				{/if}

				{#snippet editor()}
					<form method="POST" action="?/addDate" use:enhance={saved('dates')} class="flex flex-wrap items-end gap-2">
						<select name="kind" aria-label="Kind" class={INPUT}>
							{#each data.dateKinds as kind (kind)}<option value={kind}>{kind}</option>{/each}
						</select>
						<input type="date" name="date" required class={INPUT} aria-label="Day" />
						<input name="label" placeholder="Name (for custom)" class="w-full {INPUT}" />
						<label class="flex items-center gap-1.5 text-sm text-fg-muted">
							<input type="checkbox" name="yearUnknown" /> Year unknown
						</label>
						<label class="flex items-center gap-1.5 text-sm text-fg-muted">
							<input type="checkbox" name="recursYearly" checked /> Every year
						</label>
						<label class="flex items-center gap-1.5 text-sm text-fg-muted">
							<input type="checkbox" name="remind" checked /> Show on Home
						</label>
						<Button variant="primary" size="sm" class="ml-auto">Add</Button>
					</form>
				{/snippet}
			</Section>

			<Section title="Circles" count={visibleCircles.length} addLabel="Join" error={form?.circleError ?? null} bind:open={openSection.circles}>
				{#snippet action()}
					<a href="/circles" class="text-xs text-link hover:underline">All circles</a>
				{/snippet}

				{#if visibleCircles.length}
					<ul class="flex flex-wrap gap-1.5">
						{#each visibleCircles as circle (circle.membershipId)}
							<li class="min-w-0 max-w-full">
								<span class="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border py-1 pl-2.5 pr-1.5 text-sm">
									<span class="size-2 shrink-0 rounded-full" style={accentDotStyle(circle.color)}></span>
									<a
										href="/circles/{circle.circleId}"
										class="truncate text-fg hover:underline"
										title={circle.name}
									>
										{circle.name}
									</a>
									{#if circle.role}
										<span class="shrink-0 text-xs text-fg-subtle">· {circle.role}</span>
									{/if}
									<RemoveButton
										kind="membership"
										id={circle.membershipId}
										action="?/leaveCircle"
										fields={{ circleId: circle.circleId }}
										label="Leave {circle.name}"
										removed="Left the circle"
										bare
										class="contents"
									/>
								</span>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-sm text-fg-subtle">Not in any circle yet.</p>
				{/if}

				{#snippet editor()}
					<form method="POST" action="?/joinCircle" use:enhance={saved('circles')} class="flex flex-wrap items-end gap-2">
						<input
							name="circleName"
							list="circle-names"
							placeholder="Join or create a circle…"
							class="min-w-40 flex-1 {INPUT}"
						/>
						<datalist id="circle-names">
							{#each data.circleNames as name (name)}<option value={name}></option>{/each}
						</datalist>
						<input name="role" placeholder="role (optional)" class="w-28 {INPUT}" />
						<Button variant="primary" size="sm">Add</Button>
					</form>
				{/snippet}
			</Section>

			<Section title="Tags" count={visibleTags.length} addLabel="Add" error={form?.tagError ?? null} bind:open={openSection.tags}>
				{#if visibleTags.length}
					<ul class="flex flex-wrap gap-1.5">
						{#each visibleTags as tag (tag.id)}
							<li
								class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium"
								style={accentChipStyle(tag.color)}
							>
								{tag.name}
								<RemoveButton
									kind="tag"
									id={tag.id}
									action="?/removeTag"
									fields={{ tagId: tag.id }}
									label="Remove tag {tag.name}"
									removed="Tag removed"
									bare
									class="contents"
								/>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-sm text-fg-subtle">No tags yet.</p>
				{/if}

				{#snippet editor()}
					<form method="POST" action="?/addTag" use:enhance={saved('tags')} class="flex flex-wrap items-end gap-2">
						<input name="name" placeholder="Tag name" required class="min-w-32 flex-1 {INPUT}" />
						<select name="color" aria-label="Colour" class={INPUT}>
							{#each data.tagColors as color (color)}<option value={color}>{color}</option>{/each}
						</select>
						<Button variant="primary" size="sm">Add</Button>
					</form>
				{/snippet}
			</Section>

			<Section title="How we met">
				{#if metLine}
					<p class="font-serif text-[15px] leading-relaxed text-fg">{metLine}</p>
				{:else}
					<p class="text-sm text-fg-subtle">Not recorded yet.</p>
				{/if}
			</Section>
		</div>

		<!-- What has happened, and who this person is connected to -->
		<div class="order-1 flex min-w-0 flex-col gap-3 lg:order-2">
			<div class="flex gap-1 border-b border-border" role="tablist" aria-label="This person">
				{#each tabs as t (t.id)}
					<button
						role="tab"
						id="tab-{t.id}"
						aria-selected={tab === t.id}
						aria-controls="panel-{t.id}"
						onclick={() => (tab = t.id)}
						class="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors"
						class:border-primary={tab === t.id}
						class:text-fg={tab === t.id}
						class:border-transparent={tab !== t.id}
						class:text-fg-muted={tab !== t.id}
					>
						{t.label}
						{#if t.count !== undefined}
							<span class="ml-1 text-xs text-fg-subtle">{t.count}</span>
						{/if}
					</button>
				{/each}
			</div>

			<div id="panel-story" role="tabpanel" aria-labelledby="tab-story" hidden={tab !== 'story'}>
				<Section
					addLabel="Log contact"
					addIcon="met"
					bind:open={logOpen}
					error={form?.interactionError ?? null}
				>
					{#key c.id}
						<StoryTimeline contactId={c.id} initial={data.story} />
					{/key}

					{#snippet editor()}
						<form method="POST" action="?/logInteraction" class="flex flex-col gap-3">
							<div class="flex flex-wrap items-end gap-2">
								<select name="kind" aria-label="Kind" class={INPUT}>
									{#each data.interactionKinds as kind (kind)}
										<option value={kind}>{KIND_PRESENTATION[kind].label}</option>
									{/each}
								</select>
								<input type="date" name="happenedAt" value={today} required aria-label="Day" class={INPUT} />
								<input name="title" placeholder="What happened? (optional)" class="min-w-48 flex-1 {INPUT}" />
							</div>
							<textarea name="description" rows="2" placeholder="Details… (optional)" class={INPUT}
							></textarea>
							{#if data.otherContacts.length > 0}
								<label class="flex flex-col gap-1 text-sm text-fg-muted">
									Who else was there?
									<select name="participants" multiple size="3" class={INPUT}>
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
								<Button variant="primary" size="sm" class="ml-auto">Log interaction</Button>
							</div>
						</form>
					{/snippet}
				</Section>
			</div>

			<div id="panel-people" role="tabpanel" aria-labelledby="tab-people" hidden={tab !== 'people'}>
				<Section addLabel="Add relationship" error={form?.error ?? null} bind:open={relateOpen}>
					{#snippet action()}
						<a
							href="/graph?center={c.id}"
							class="inline-flex items-center gap-1 text-xs text-link hover:underline"
						>
							<Icon name="explore" size={12} />Explore in graph
						</a>
					{/snippet}

					{#if data.relationships.length > 0}
						<ul class="flex flex-col divide-y divide-border-subtle">
							{#each data.relationships as rel (rel.id)}
								<li class="flex items-center gap-3 py-2 text-sm">
									<span
										class="size-2 shrink-0 rounded-full"
										style="background:{categoryVar(rel.category)}"
									></span>
									<span class="w-24 shrink-0 truncate text-fg-muted">{rel.label}</span>
									<a href="/contacts/{rel.otherContactId}" class="font-medium text-fg hover:underline">
										{rel.otherDisplayName}
									</a>
									{#if rel.description}
										<span class="truncate text-fg-subtle">· {rel.description}</span>
									{/if}
								</li>
							{/each}
						</ul>

						{#if egoNodes.length > 0}
							<div class="mt-3">
								<Button type="button" variant="ghost" size="sm" onclick={() => (showMap = !showMap)}>
									{showMap ? 'Hide map' : 'Show map'}
								</Button>
								{#if showMap}
									<div class="mt-2">
										<EgoGraph centerName={c.displayName} nodes={egoNodes} />
									</div>
								{/if}
							</div>
						{/if}
					{:else}
						<p class="text-sm text-fg-subtle">No relationships yet.</p>
					{/if}

					{#snippet editor()}
						{#if data.otherContacts.length > 0}
							<form method="POST" action="?/addRelationship" use:enhance={savedRelationship} class="flex flex-wrap items-end gap-3">
								<label class="flex flex-1 flex-col gap-1 text-sm">
									<span class="text-fg-muted">{c.displayName} is…</span>
									<select name="typeId" class={INPUT}>
										{#each data.relationshipTypes as type (type.id)}
											<option value={type.id}>{type.forwardLabel}</option>
										{/each}
									</select>
								</label>
								<label class="flex flex-1 flex-col gap-1 text-sm">
									<span class="text-fg-muted">Person</span>
									<select name="targetId" class={INPUT}>
										{#each data.otherContacts as other (other.id)}
											<option value={other.id} selected={other.id === data.relateTo}>
												{other.displayName}
											</option>
										{/each}
									</select>
								</label>
								<Button variant="primary" size="sm">Add</Button>
							</form>
						{:else}
							<p class="text-sm text-fg-subtle">Add another person first, then link them here.</p>
						{/if}
					{/snippet}
				</Section>
			</div>

			<div id="panel-notes" role="tabpanel" aria-labelledby="tab-notes" hidden={tab !== 'notes'}>
				<Section addLabel="Add note" error={form?.noteError ?? null} bind:open={openSection.note}>
					{#if data.notes.length > 0}
						<ul class="flex flex-col gap-3">
							{#each data.notes as note (note.id)}
								<li class="rounded-control bg-bg-sunken p-3">
									<div class="mb-1 flex items-center gap-2">
										{#if note.isPinned}
											<span class="inline-flex items-center gap-1 text-xs font-medium text-primary">
												<Icon name="pinned" size={12} />pinned
											</span>
										{/if}
										{#if note.title}<span class="font-medium text-fg">{note.title}</span>{/if}
										{#if note.visibility === 'private'}
											<span class="ml-auto inline-flex items-center gap-1 text-xs text-fg-subtle">
												<Icon name="private" size={11} />private
											</span>
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

					{#snippet editor()}
						<form method="POST" action="?/addNote" use:enhance={saved('note')} class="flex flex-col gap-3">
							<textarea
								name="body"
								rows="3"
								required
								placeholder="Write a note… (Markdown supported)"
								class={INPUT}
							></textarea>
							<div class="flex flex-wrap items-center gap-4 text-sm">
								<label class="flex items-center gap-1.5"><input type="checkbox" name="isPinned" /> Pin</label>
								<label class="flex items-center gap-1.5">
									<input type="radio" name="visibility" value="shared" checked /> Shared
								</label>
								<label class="flex items-center gap-1.5">
									<input type="radio" name="visibility" value="private" /> Private
								</label>
								<Button variant="primary" size="sm" class="ml-auto">Add note</Button>
							</div>
						</form>
					{/snippet}
				</Section>
			</div>
		</div>
	</div>
</main>
