<script lang="ts">
	import { onMount } from 'svelte';

	/*
	 * Inline journal on the contact page: entries grouped by calendar week, oldest weeks
	 * loaded on demand as you scroll (keyset cursor from /journal/entries). Bodies are the
	 * server-rendered, already-safe Markdown (docs/02 §2.5). Writing (with photos) stays on
	 * the full journal page.
	 */
	interface Entry {
		id: string;
		entryDate: string;
		title: string | null;
		bodyHtml: string;
		visibility: 'shared' | 'private';
		mine: boolean;
		photos: string[];
	}
	interface Cursor {
		entryDate: string;
		createdAt: number;
	}

	let {
		contactId,
		initial
	}: { contactId: string; initial: { entries: Entry[]; nextCursor: Cursor | null } } = $props();

	// Seeded once per contact; the page wraps this component in {#key contactId} so a fresh
	// instance (and fresh state) is created when you navigate to another person.
	// svelte-ignore state_referenced_locally
	let entries = $state<Entry[]>(initial.entries);
	// svelte-ignore state_referenced_locally
	let cursor = $state<Cursor | null>(initial.nextCursor);
	let loading = $state(false);
	let failed = $state(false);
	const done = $derived(cursor === null);

	// Monday-anchored week bucketing.
	function weekStart(iso: string): Date {
		const d = new Date(iso + 'T00:00:00');
		const shift = (d.getDay() + 6) % 7; // 0 = Monday
		d.setDate(d.getDate() - shift);
		d.setHours(0, 0, 0, 0);
		return d;
	}
	const fmtDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
	const fmtFull = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	const fmtEntry = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

	function weekLabel(iso: string): string {
		const start = weekStart(iso);
		const end = new Date(start);
		end.setDate(end.getDate() + 6);
		const thisWeek = weekStart(new Date().toLocaleDateString('en-CA'));
		if (start.getTime() === thisWeek.getTime()) return 'This week';
		return `${fmtDay.format(start)} – ${fmtFull.format(end)}`;
	}

	// Group the flat, already-sorted list into consecutive week buckets.
	const weeks = $derived.by(() => {
		const out: { key: string; label: string; entries: Entry[] }[] = [];
		for (const e of entries) {
			const key = weekStart(e.entryDate).toISOString().slice(0, 10);
			const last = out.at(-1);
			if (last && last.key === key) last.entries.push(e);
			else out.push({ key, label: weekLabel(e.entryDate), entries: [e] });
		}
		return out;
	});

	async function loadMore() {
		if (loading || done) return;
		loading = true;
		failed = false;
		try {
			const q = new URLSearchParams({
				before_date: cursor!.entryDate,
				before_ts: String(cursor!.createdAt)
			});
			const res = await fetch(`/contacts/${contactId}/journal/entries?${q}`);
			if (!res.ok) throw new Error(String(res.status));
			const page: { entries: Entry[]; nextCursor: Cursor | null } = await res.json();
			entries = [...entries, ...page.entries];
			cursor = page.nextCursor;
		} catch {
			failed = true;
		} finally {
			loading = false;
		}
	}

	// Auto-load the next page when the sentinel scrolls into view.
	let sentinel: HTMLDivElement;
	onMount(() => {
		const io = new IntersectionObserver(
			(obs) => {
				if (obs.some((e) => e.isIntersecting)) loadMore();
			},
			{ rootMargin: '200px' }
		);
		io.observe(sentinel);
		return () => io.disconnect();
	});

	function entryDay(iso: string): string {
		return fmtEntry.format(new Date(iso + 'T00:00:00'));
	}
</script>

<div class="flex flex-col gap-4">
	{#if entries.length === 0}
		<p class="text-sm text-fg-subtle">
			No journal entries yet.
			<a href="/contacts/{contactId}/journal" class="text-link hover:underline">Write the first one</a>.
		</p>
	{:else}
		{#each weeks as week (week.key)}
			<section class="flex flex-col gap-2">
				<h3 class="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{week.label}</h3>
				{#each week.entries as e (e.id)}
					<article class="rounded-app border border-border bg-card p-4">
						<div class="mb-1 flex flex-wrap items-center gap-2">
							<span class="text-sm font-medium text-fg">{entryDay(e.entryDate)}</span>
							{#if e.title}<span class="text-sm text-fg-muted">· {e.title}</span>{/if}
							{#if e.visibility === 'private'}
								<span class="ml-auto text-xs text-fg-subtle">private</span>
							{/if}
						</div>
						<div class="note-body text-fg">{@html e.bodyHtml}</div>
						{#if e.photos.length > 0}
							<div class="mt-3 flex flex-wrap gap-2">
								{#each e.photos as pid (pid)}
									<img
										src="/media/{pid}"
										alt={e.title ?? entryDay(e.entryDate)}
										loading="lazy"
										class="size-20 rounded-md object-cover"
									/>
								{/each}
							</div>
						{/if}
					</article>
				{/each}
			</section>
		{/each}
	{/if}

	<!-- Infinite-scroll sentinel + status -->
	<div bind:this={sentinel} class="min-h-px"></div>
	{#if loading}
		<p class="py-2 text-center text-sm text-fg-subtle">Loading earlier weeks…</p>
	{:else if failed}
		<button onclick={loadMore} class="py-2 text-center text-sm text-link hover:underline">
			Couldn’t load more — retry
		</button>
	{:else if done && entries.length > 0}
		<p class="py-2 text-center text-xs text-fg-subtle">Beginning of the journal.</p>
	{/if}
</div>
