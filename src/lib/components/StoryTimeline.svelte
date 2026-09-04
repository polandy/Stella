<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { dayLabel } from '$lib/dates/labels';
	import { KIND_PRESENTATION } from '$lib/interactions/kinds';
	import type { StoryCursorView, StoryItemView, StoryPageView } from '$lib/story/item';

	/*
	 * A person's story (docs/02 §2.23): what people wrote about them and the times they were in
	 * touch, in one order. Older pages load on demand from the story endpoint, which merges the
	 * two sources server-side — the client only ever appends what it is handed.
	 */
	interface Props {
		contactId: string;
		initial: StoryPageView;
	}
	let { contactId, initial }: Props = $props();

	// Seeded once per contact; the page wraps this in {#key contactId} so navigating to another
	// person makes a fresh instance with fresh state.
	// svelte-ignore state_referenced_locally
	let items = $state<StoryItemView[]>(initial.items);
	// svelte-ignore state_referenced_locally
	let cursor = $state<StoryCursorView | null>(initial.nextCursor);
	let loading = $state(false);
	let failed = $state(false);
	const done = $derived(cursor === null);

	async function loadOlder() {
		if (cursor === null || loading) return;
		loading = true;
		failed = false;
		try {
			const response = await fetch(`/contacts/${contactId}/story`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(cursor)
			});
			if (!response.ok) throw new Error(`Story page failed: ${response.status}`);
			const page: StoryPageView = await response.json();
			items = [...items, ...page.items];
			cursor = page.nextCursor;
		} catch {
			failed = true;
		} finally {
			loading = false;
		}
	}

	/** Group the flat, already-ordered list into consecutive days. */
	const days = $derived.by(() => {
		const groups: { day: string; items: StoryItemView[] }[] = [];
		for (const item of items) {
			let group = groups.at(-1);
			if (!group || group.day !== item.day) {
				group = { day: item.day, items: [] };
				groups.push(group);
			}
			group.items.push(item);
		}
		return groups;
	});

	/** The form action that removes an item, by what kind of thing it is. */
	const removeAction = (item: StoryItemView) =>
		item.kind === 'journal' ? '?/removeJournalEntry' : '?/removeInteraction';
</script>

{#if items.length === 0}
	<div class="rounded-app border border-dashed border-border px-6 py-10 text-center">
		<p class="text-fg-muted">Nothing written down yet.</p>
		<p class="mt-1 text-sm text-fg-subtle">
			Log a call or a visit, or write what happened — it all lands here.
		</p>
	</div>
{:else}
	<ol class="flex flex-col" data-testid="story-timeline">
		{#each days as group (group.day)}
			<li>
				<div class="flex items-center gap-3 pb-2 pt-5 first:pt-0">
					<h3 class="text-xs font-semibold text-fg-subtle">{dayLabel(group.day)}</h3>
					<span class="h-px flex-1 bg-border-subtle"></span>
				</div>

				<!-- One rail down the day, a dot per thing that happened on it. -->
				<ol class="relative flex flex-col gap-4 border-l border-border-subtle pb-1 pl-4">
					{#each group.items as item (item.kind + item.id)}
						{@const kind = item.kind === 'interaction' ? KIND_PRESENTATION[item.interactionKind] : null}
						<li data-story-item class="group/item relative">
							<span
								class="absolute -left-[1.3125rem] top-1.5 size-2.5 rounded-full ring-4 ring-card"
								style="background:{kind ? kind.accent : 'var(--primary)'}"
							></span>
							<div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
								{#if kind}
									<span class="inline-flex items-center gap-1.5 font-semibold" style="color:{kind.accent}">
										<Icon name={kind.icon} size={13} />{kind.label}
									</span>
								{:else}
									<span class="inline-flex items-center gap-1.5 font-semibold text-primary">
										<Icon name="journal" size={13} />Journal
									</span>
								{/if}
								{#if item.mine}<span class="text-fg-subtle">· you</span>{/if}
								{#if item.visibility === 'private'}
									<span
										class="inline-flex items-center gap-1 text-fg-subtle"
										title="Only you can see this"
									>
										<Icon name="private" size={11} />private
									</span>
								{/if}
								{#if item.mine}
									<form method="POST" action={removeAction(item)} class="ml-auto">
										<input type="hidden" name="id" value={item.id} />
										<Button
											variant="danger"
											size="sm"
											icon="remove"
											label={item.kind === 'journal' ? 'Remove entry' : 'Remove interaction'}
											class="opacity-0 transition-opacity group-hover/item:opacity-100 focus-visible:opacity-100"
										/>
									</form>
								{/if}
							</div>

							{#if item.kind === 'journal'}
								{#if item.title}
									<h4 class="mt-1 font-semibold text-fg">{item.title}</h4>
								{/if}
								<!-- server-rendered, already-safe Markdown (docs/02 §2.5) -->
								<div class="note-body mt-0.5 max-w-[65ch] text-fg">{@html item.bodyHtml}</div>
								{#if item.photos.length}
									<div class="mt-3 flex flex-wrap gap-2">
										{#each item.photos as photoId (photoId)}
											<a
												href="/media/{photoId}"
												target="_blank"
												rel="noreferrer"
												class="block overflow-hidden rounded-control"
											>
												<img
													src="/media/{photoId}?thumb"
													alt=""
													loading="lazy"
													class="size-20 object-cover"
												/>
											</a>
										{/each}
									</div>
								{/if}
							{:else}
								{#if item.title}<p class="mt-0.5 font-medium text-fg">{item.title}</p>{/if}
								{#if item.description}
									<p class="mt-1 whitespace-pre-line text-sm text-fg-muted">{item.description}</p>
								{/if}
								{#if item.participants.length}
									<div class="mt-2 flex flex-wrap gap-1.5">
										{#each item.participants as person (person.contactId)}
											<a
												href="/contacts/{person.contactId}"
												class="inline-flex items-center gap-1.5 rounded-full bg-bg-sunken py-0.5 pl-1 pr-2.5 text-xs text-fg-muted transition-colors hover:text-fg"
											>
												<Avatar id={person.contactId} name={person.displayName} size={18} />
												{person.displayName}
											</a>
										{/each}
									</div>
								{/if}
							{/if}
						</li>
					{/each}
				</ol>
			</li>
		{/each}
	</ol>

	{#if !done}
		<div class="mt-4 flex flex-col items-center gap-2">
			<Button type="button" size="sm" onclick={loadOlder} disabled={loading}>
				{loading ? 'Loading…' : 'Show earlier'}
			</Button>
			{#if failed}
				<p class="text-xs text-danger" role="status">
					Could not load the earlier entries. Try again.
				</p>
			{/if}
		</div>
	{/if}
{/if}
