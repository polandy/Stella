<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import InteractionEditor from '$lib/components/person/InteractionEditor.svelte';
	import PrivateMark from '$lib/components/ui/PrivateMark.svelte';
	import Swap from '$lib/components/ui/Swap.svelte';
	import Veil from '$lib/components/ui/Veil.svelte';
	import { contactSectionPath } from '$lib/people/sections';
	import { dayLabel } from '$lib/dates/labels';
	import { occasionLabel } from '$lib/gifts/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { KIND_PRESENTATION } from '$lib/story/interaction-kinds';
	import { groupStoryByDay } from '$lib/story/grouping';
	import type { SelectablePerson } from '$lib/people/select';
	import type {
		StoryCursorView,
		StoryItemView,
		StoryPageView,
		StoryTodoItem
	} from '$lib/story/item';
	import { placeholderFor } from '$lib/privacy/veil';
	import { useVeil } from '$lib/privacy/veil.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey as buildKey } from '$lib/undo/keys';
	import { removeThroughAction } from '$lib/undo/deferred-removal';
	import { submitAction } from '$lib/undo/submit-action';

	/*
	 * A person's story (docs/02 §2.23): what people wrote about them, the times they were in
	 * touch, the gifts that changed hands and the to-dos ticked off, in one order. Older pages load on demand from the story endpoint, which merges the
	 * sources server-side — the client only ever appends what it is handed.
	 */
	interface Props {
		contactId: string;
		initial: StoryPageView;
		/** Whom else a touchpoint being corrected can name: everyone visible but this person. */
		candidates: SelectablePerson[];
	}
	let { contactId, initial, candidates }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;

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

	// Removing is held back for an undo window (docs/02 §2.23): the item leaves the list at
	// once, the toast offers Undo, and the form is posted only when the window closes.
	const removals = useRemovals();
	const removalKey = (item: StoryItemView) => buildKey(item.kind, item.id);
	const shown = $derived(items.filter((item) => !removals.isPending(removalKey(item))));
	const days = $derived(groupStoryByDay(shown));

	/*
	 * A given or received gift (docs/02 §2.25) reads like a touchpoint: the gift icon and
	 * `--kind-gift` — the gift's alone since the touchpoint kind went (§2.25.4) — and what
	 * happened as its label.
	 */
	const GIFT_PRESENTATION = {
		given: { label: 'gifts.story.given', icon: 'gift', accent: 'var(--kind-gift)' },
		received: { label: 'gifts.story.received', icon: 'gift', accent: 'var(--kind-gift)' }
	} as const;

	/* A to-do ticked off (docs/02 §2.26): the check icon and `--success`, *Done* as its label. */
	const TODO_PRESENTATION = {
		label: 'todos.story.done',
		icon: 'done',
		accent: 'var(--success)'
	} as const;

	// Unticked from here, a to-do opens again on the card and leaves the story; the box stays
	// checked and still until Stella has answered.
	let reopeningId = $state<string | null>(null);
	async function reopen(item: StoryTodoItem) {
		reopeningId = item.id;
		const body = new FormData();
		body.set('todoId', item.id);
		try {
			await submitAction(fetch, '?/untickTodo', body);
			items = items.filter((other) => removalKey(other) !== removalKey(item));
			removals.notify(t('todos.story.reopened', { title: item.title }));
		} catch {
			removals.notify(t('errors.todo.couldNotSave'));
		}
		reopeningId = null;
		// the To do card is the page's, not ours
		await invalidateAll();
	}

	// One touchpoint is corrected at a time, in its place (docs/02 §2.6).
	let editingId = $state<string | null>(null);

	// A private item's words and photos stay blurred until asked for (docs/02 §2.10.1); its
	// kind, author and day stay readable, so the story still reads in order.
	const veil = useVeil();
	const veilId = (item: StoryItemView) => `${item.kind}:${item.id}`;

	function toggleEditor(item: StoryItemView) {
		if (editingId === item.id) {
			editingId = null;
			return;
		}
		if (item.visibility === 'private') veil.revealForEdit(veilId(item));
		editingId = item.id;
	}

	/** The form action that removes an item, by what kind of thing it is. */
	const removeAction = (item: StoryItemView) =>
		item.kind === 'journal'
			? '?/removeJournalEntry'
			: item.kind === 'todo'
				? '?/removeTodo'
				: '?/removeInteraction';

	const removedLabel = (item: StoryItemView) =>
		item.kind === 'journal'
			? t('story.entryRemoved')
			: item.kind === 'todo'
				? t('todos.removed')
				: t('story.interactionRemoved');

	const removeLabel = (item: StoryItemView) =>
		item.kind === 'journal'
			? t('story.removeEntry')
			: item.kind === 'todo'
				? t('todos.remove', { title: item.title })
				: t('story.removeInteraction');

	function deferRemoval(event: SubmitEvent, item: StoryItemView) {
		event.preventDefault();
		const body = new FormData(event.currentTarget as HTMLFormElement);
		const key = removalKey(item);
		removals.remove({
			key,
			label: removedLabel(item),
			commit: async () => {
				await removeThroughAction(fetch, removeAction(item), body);
				items = items.filter((other) => removalKey(other) !== key);
				// the hero's "last contact" and the tab counts are the page's, not ours
				await invalidateAll();
			}
		});
	}
</script>

{#snippet removeForm(item: StoryItemView)}
	<form method="POST" action={removeAction(item)} onsubmit={(event) => deferRemoval(event, item)}>
		<!-- The to-do actions name their record as the card's do. -->
		<input type="hidden" name={item.kind === 'todo' ? 'todoId' : 'id'} value={item.id} />
		<Button variant="danger" size="sm" icon="remove" label={removeLabel(item)} />
	</form>
{/snippet}

{#if items.length === 0}
	<!-- One sentence: *Log contact* is already in the card's header (docs/05 §5.5). -->
	<p
		class="rounded-app border border-dashed border-border px-4 py-5 text-center text-sm text-fg-muted"
	>
		{t('story.empty')}
	</p>
{:else}
	<ol class="flex flex-col" data-testid="story-timeline">
		{#each days as group (group.day)}
			<li>
				<div class="flex items-center gap-3 pt-5 pb-2 first:pt-0">
					<h3 class="text-xs font-semibold text-fg-subtle">{dayLabel(i18n, group.day)}</h3>
					<span class="h-px flex-1 bg-border-subtle"></span>
				</div>

				<!-- One rail down the day, a dot per thing that happened on it. -->
				<ol class="relative flex flex-col gap-4 border-l border-border-subtle pb-1 pl-4">
					{#each group.items as item (item.kind + item.id)}
						{@const kind =
							item.kind === 'interaction'
								? KIND_PRESENTATION[item.interactionKind]
								: item.kind === 'gift'
									? GIFT_PRESENTATION[item.giftState]
									: item.kind === 'todo'
										? TODO_PRESENTATION
										: null}
						<li data-story-item class="group/item relative">
							<span
								class="absolute top-1.5 -left-[1.3125rem] size-2.5 rounded-full ring-4 ring-card"
								style="background:{kind ? kind.accent : 'var(--primary)'}"
							></span>
							<div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
								{#if kind}
									<span class="inline-flex items-center gap-1.5 font-semibold text-fg">
										<span style="color:{kind.accent}"><Icon name={kind.icon} size={13} /></span>{t(
											kind.label
										)}
									</span>
								{:else}
									<span class="inline-flex items-center gap-1.5 font-semibold text-primary">
										<Icon name="journal" size={13} />{t('story.journal')}
									</span>
								{/if}
								{#if item.author}<span class="text-fg-subtle">· {item.author}</span>{/if}
								{#if item.visibility === 'private'}
									<PrivateMark
										veilId={item.kind === 'gift' || item.kind === 'todo' ? undefined : veilId(item)}
									/>
								{/if}
								<!-- A gift is changed and removed on the Gifts card, where it lives; a done to-do's cross
								     stands beside its line, as on the card. -->
								{#if (item.kind === 'interaction' && item.editable) || (item.removable && item.kind !== 'todo')}
									<!-- On hover or focus — always on a touch screen, which has no hover, and
									     while the item is being edited. -->
									<span
										class="ml-auto inline-flex items-center gap-1 transition-opacity {editingId ===
										item.id
											? 'opacity-100'
											: 'opacity-0 group-hover/item:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100'}"
									>
										<!-- Its author's alone (docs/03 §3.7). Online only. -->
										{#if item.kind === 'interaction' && item.editable}
											<Button
												variant="ghost"
												size="sm"
												type="button"
												icon="write"
												label={t('story.editInteraction')}
												title={t('story.editInteraction')}
												aria-expanded={editingId === item.id}
												onclick={() => toggleEditor(item)}
											/>
										{/if}
										{#if item.removable}
											{@render removeForm(item)}
										{/if}
									</span>
								{/if}
							</div>

							{#if item.kind === 'journal'}
								<Veil
									id={veilId(item)}
									isPrivate={item.visibility === 'private'}
									label={t('privacy.veil.moment')}
								>
									{#snippet standIn()}
										{#if item.title}
											<p class="mt-1 font-semibold text-fg">{placeholderFor(item.title)}</p>
										{/if}
										<p class="mt-0.5 max-w-[65ch] whitespace-pre-line text-fg">
											{placeholderFor(item.bodyHtml)}
										</p>
										{#if item.photos.length}
											<div class="mt-3 flex flex-wrap gap-2">
												{#each item.photos as photoId (photoId)}
													<span class="size-20 rounded-control bg-fg-subtle/40"></span>
												{/each}
											</div>
										{/if}
									{/snippet}
									{#if item.title}
										<h4 class="mt-1 font-semibold text-fg">{item.title}</h4>
									{/if}
									<!-- server-rendered, already-safe Markdown (docs/02 §2.5) -->
									<div class="note-body mt-0.5 max-w-[65ch] text-fg">{@html item.bodyHtml}</div>
									{#if item.photos.length}
										<div class="mt-3 flex flex-wrap gap-2">
											{#each item.photos as photoId, index (photoId)}
												<a
													href="/media/{photoId}"
													target="_blank"
													rel="noreferrer"
													class="block overflow-hidden rounded-control"
												>
													<img
														src="/media/{photoId}?thumb"
														alt={t('components.photo.open', {
															n: index + 1,
															count: item.photos.length
														})}
														loading="lazy"
														class="size-20 object-cover"
													/>
												</a>
											{/each}
										</div>
									{/if}
								</Veil>
							{:else if item.kind === 'gift'}
								<!-- Links to the card the gift lives on, where it is changed. -->
								<a
									href={contactSectionPath(contactId, 'gifts')}
									class="mt-0.5 block font-medium text-fg hover:underline">{item.title}</a
								>
								{#if item.occasion}
									<p class="text-sm text-fg-muted">{occasionLabel(t, item.occasion)}</p>
								{/if}
							{:else if item.kind === 'todo'}
								<div class="mt-0.5 flex items-start gap-2">
									<!-- Still checked: unchecking it opens the to-do again, as on the card. The box
									     stands on the right, under the thumb (docs/05 §5.1). -->
									<label
										for="story-todo-{item.id}"
										class="min-w-0 flex-1 cursor-pointer font-medium text-fg">{item.title}</label
									>
									<!-- On hover or focus, always on a touch screen — as in the kind line. -->
									<span
										class="shrink-0 opacity-0 transition-opacity group-hover/item:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100"
									>
										{@render removeForm(item)}
									</span>
									<input
										id="story-todo-{item.id}"
										type="checkbox"
										checked
										disabled={reopeningId === item.id}
										aria-label={t('todos.story.reopen', { title: item.title })}
										onchange={() => reopen(item)}
										class="mt-0.5 size-4 shrink-0 accent-primary"
										data-testid="story-todo-reopen"
									/>
								</div>
							{:else}
								<!-- The touchpoint and its editor glide into each other in place (docs/05 §5.11). -->
								<Swap when={editingId === item.id}>
									<InteractionEditor
										{item}
										{contactId}
										{candidates}
										onDone={() => (editingId = null)}
									/>
									{#snippet otherwise()}
										<Veil
											id={veilId(item)}
											isPrivate={item.visibility === 'private' &&
												Boolean(item.title || item.description)}
											label={t('privacy.veil.interaction')}
										>
											{#snippet standIn()}
												{#if item.title}
													<p class="mt-0.5 font-medium text-fg">{placeholderFor(item.title)}</p>
												{/if}
												{#if item.description}
													<p class="mt-1 text-sm whitespace-pre-line text-fg-muted">
														{placeholderFor(item.description)}
													</p>
												{/if}
											{/snippet}
											{#if item.title}<p class="mt-0.5 font-medium text-fg">{item.title}</p>{/if}
											{#if item.description}
												<p class="mt-1 text-sm whitespace-pre-line text-fg-muted">
													{item.description}
												</p>
											{/if}
										</Veil>
										{#if item.participants.length}
											<div class="mt-2 flex flex-wrap gap-1.5">
												{#each item.participants as person (person.contactId)}
													<a
														href="/contacts/{person.contactId}"
														class="inline-flex items-center gap-1.5 rounded-full bg-bg-sunken py-0.5 pr-2.5 pl-1 text-xs text-fg-muted transition-colors hover:text-fg"
													>
														<Avatar id={person.contactId} name={person.displayName} size={18} />
														{person.displayName}
													</a>
												{/each}
											</div>
										{/if}
									{/snippet}
								</Swap>
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
				{loading ? t('common.loading') : t('story.showEarlier')}
			</Button>
			{#if failed}
				<p class="text-xs text-danger" role="status">
					{t('story.loadFailed')}
				</p>
			{/if}
		</div>
	{/if}
{/if}
