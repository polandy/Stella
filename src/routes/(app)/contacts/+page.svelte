<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { quietLabel } from '$lib/dates/labels';
	import { accentChipStyle } from '$lib/design/tokens';
	import { groupByLetter, matchesQuery } from '$lib/people/directory';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let query = $state('');

	const found = $derived(data.contacts.filter((c) => matchesQuery(c, query)));
	const groups = $derived(groupByLetter(found));

	const DAY_MS = 86_400_000;
	const today = $derived(Date.parse(`${data.today}T00:00:00Z`));

	/** How long since anything was written, or nothing when there is nothing to say. */
	function sinceLabel(lastTouchedOn: string | null): string | null {
		if (lastTouchedOn === null) return null;
		const days = Math.round((today - Date.parse(`${lastTouchedOn}T00:00:00Z`)) / DAY_MS);
		if (days <= 0) return 'today';
		if (days === 1) return 'yesterday';
		return `${quietLabel(days)} ago`;
	}
</script>

<svelte:head><title>People · Stella</title></svelte:head>

<main class="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6 md:px-6 md:py-10">
	<header>
		<h1 class="text-2xl font-semibold text-fg">People</h1>
		<p class="text-sm text-fg-muted">
			{data.contacts.length} {data.contacts.length === 1 ? 'person' : 'people'}{#if data.activeTag}
				with this tag{/if}
		</p>
	</header>

	<!-- Find as you type. Filtering runs on what is already loaded, so there is no round trip
	     and no wait between the keystroke and the list. -->
	<label class="flex items-center gap-2 rounded-control border border-border bg-card px-3 py-2 shadow-card focus-within:border-primary">
		<Icon name="search" size={15} />
		<span class="sr-only">Find someone</span>
		<input
			type="search"
			bind:value={query}
			placeholder="Find someone…"
			autocomplete="off"
			class="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
		/>
	</label>

	{#if data.tags.length > 0}
		<div class="flex flex-wrap items-center gap-2">
			<a
				href="/contacts"
				class="rounded-full px-3 py-1 text-sm font-medium transition-colors"
				class:bg-primary-soft={!data.activeTag}
				class:text-primary={!data.activeTag}
				class:text-fg-muted={data.activeTag}
			>
				All
			</a>
			{#each data.tags as tag (tag.id)}
				<a
					href="/contacts?tag={tag.id}"
					class="rounded-full px-3 py-1 text-sm font-medium"
					style={accentChipStyle(tag.color, { active: data.activeTag === tag.id })}
				>
					{tag.name}
				</a>
			{/each}
		</div>
	{/if}

	{#if data.contacts.length === 0}
		<div class="rounded-app border border-dashed border-border p-10 text-center">
			<p class="text-fg-muted">No people yet.</p>
			<p class="mt-1 text-sm text-fg-subtle">Add the first person — everything else in Stella hangs off someone.</p>
			<div class="mt-4"><Button variant="primary" icon="add" href="/contacts/new">Add person</Button></div>
		</div>
	{:else if found.length === 0}
		<p class="px-2 py-6 text-center text-sm text-fg-muted" role="status">Nobody matches “{query}”.</p>
	{:else}
		<div class="flex flex-col gap-4" data-testid="people-directory">
			<div class="flex justify-end px-2.5 text-[11px] font-medium text-fg-subtle" aria-hidden="true">Last written about</div>
			{#each groups as group (group.letter)}
				<section>
					<h2 class="sticky top-0 z-10 flex items-center gap-3 bg-bg py-1.5 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
						{group.letter}<span class="h-px flex-1 bg-border"></span>
					</h2>
					<ul class="flex flex-col">
						{#each group.people as contact (contact.id)}
							{@const since = sinceLabel(contact.lastTouchedOn)}
							<li>
								<a
									href="/contacts/{contact.id}"
									class="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 rounded-app px-2.5 py-2 transition-colors hover:bg-card"
								>
									<Avatar id={contact.id} name={contact.displayName} avatarPhotoId={contact.avatarPhotoId} size={36} />
									<span class="min-w-0">
										<span class="flex items-center gap-1.5">
											<span class="truncate font-medium text-fg">{contact.displayName}</span>
											{#if contact.visibility === 'private'}
												<Icon name="private" size={12} />
												<span class="sr-only">private</span>
											{/if}
										</span>
										{#if contact.description}
											<span class="block truncate text-sm text-fg-muted">{contact.description}</span>
										{/if}
									</span>
									<span class="whitespace-nowrap text-xs tabular-nums text-fg-subtle" title={since ? `Last written about ${contact.lastTouchedOn}` : 'Nothing written yet'}>
										{since ?? '—'}
									</span>
								</a>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>
	{/if}
</main>
