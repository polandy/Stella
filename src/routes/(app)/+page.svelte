<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import MomentComposer from '$lib/components/MomentComposer.svelte';
	import { occasionLabel, whenLabel } from '$lib/dates/labels';
	import { KIND_PRESENTATION } from '$lib/interactions/kinds';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	function ago(ms: number): string {
		const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
		if (s < 60) return 'just now';
		if (s < 3600) return `${Math.floor(s / 60)}m ago`;
		if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
		if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
		return `${Math.floor(s / 604800)}w ago`;
	}

	function dayLabel(ms: number): string {
		const d = new Date(ms);
		const today = new Date();
		const diff = Math.round((today.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
		if (diff === 0) return 'Today';
		if (diff === 1) return 'Yesterday';
		return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
	}

	// Group the newest-first stream by calendar day.
	const days = $derived.by(() => {
		const groups: { label: string; items: PageData['stream'] }[] = [];
		for (const item of data.stream) {
			const label = dayLabel(item.at);
			let g = groups.at(-1);
			if (!g || g.label !== label) {
				g = { label, items: [] };
				groups.push(g);
			}
			g.items.push(item);
		}
		return groups;
	});

	let hintDismissed = $state(false);
</script>

<svelte:head><title>Home · Stella</title></svelte:head>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 md:px-6 md:py-10">
	<header>
		<h1 class="text-2xl font-semibold text-fg">What happened?</h1>
		<p class="text-sm text-fg-muted">Write it down once. Everyone in the household sees it, unless you keep it private.</p>
	</header>

	<!-- On a phone the composer is pinned above the tab bar; on desktop it sits at the top. -->
	<div class="sticky bottom-16 z-10 -mx-4 bg-bg/95 px-4 py-2 backdrop-blur max-md:order-last md:static md:m-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
		<!-- Keyed on the draft so arriving from "Write a moment" (?about=…) remounts the
		     composer with that person already typed in; a draft is a starting value only. -->
		{#key data.draft}
			<MomentComposer
				candidates={data.candidates}
				me={{ id: data.user.id, name: data.user.name }}
				today={data.today}
				error={form?.momentError ?? null}
				draft={form?.draft ?? data.draft}
				autofocus={data.compose}
			/>
		{/key}
	</div>

	{#if data.linkSuggestion && !hintDismissed}
		<div class="flex items-center gap-3 rounded-app border border-success/35 bg-success/10 px-4 py-2.5 text-sm text-fg" role="status">
			<div class="flex-1">
				<b class="font-semibold">Link {data.linkSuggestion.a.name} and {data.linkSuggestion.b.name}?</b>
				<span class="block text-xs text-fg-muted">They appear together in that moment. Pick how they are related.</span>
			</div>
			<Button
				variant="primary"
				size="sm"
				href="/contacts/{data.linkSuggestion.a.id}?relate={data.linkSuggestion.b.id}#relationships"
			>
				Link
			</Button>
			<Button variant="ghost" size="sm" href="/" onclick={() => (hintDismissed = true)}>Not now</Button>
		</div>
	{/if}

	<!-- Coming up: the next 30 days, above the past. Absent entirely when nothing is due,
	     because a box that is permanently empty teaches people to stop looking at it. -->
	{#if data.upcoming.length}
		<section>
			<div class="flex items-center gap-3 pb-1.5 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
				Coming up<span class="h-px flex-1 bg-border"></span>
			</div>
			<ul class="flex flex-col">
				{#each data.upcoming as item (item.contactId + item.date + item.kind)}
					<li class="grid grid-cols-[32px_1fr_auto] items-center gap-3 rounded-app px-2.5 py-2 transition-colors hover:bg-card">
						<Avatar id={item.contactId} name={item.contactName} avatarPhotoId={item.avatarPhotoId} size={32} />
						<div class="min-w-0 text-[13px] text-fg-muted">
							<a href="/contacts/{item.contactId}" class="font-semibold text-fg hover:underline">{item.contactName}</a>
							<span>{occasionLabel(item)}</span>
							<span class="text-fg-subtle">· {whenLabel(item.daysUntil, item.date)}</span>
						</div>
						<Button variant="ghost" size="sm" icon="write" href="/?about={item.contactId}">
							Write a moment
						</Button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if days.length}
		<ol class="flex flex-col">
			{#each days as day (day.label)}
				<li>
					<div class="flex items-center gap-3 pb-1.5 pt-4 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
						{day.label}<span class="h-px flex-1 bg-border"></span>
					</div>
					{#each day.items as item (item.kind + item.id)}
						<article class="grid grid-cols-[32px_1fr] gap-3 rounded-app px-2.5 py-2.5 transition-colors hover:bg-card">
							{#if item.kind === 'moment'}
								<Avatar id={item.anchor.id} name={item.anchor.name} avatarPhotoId={item.anchor.avatarPhotoId} size={32} />
								<div class="min-w-0">
									<div class="flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-fg-muted">
										<b class="font-semibold text-fg">{item.mine ? 'You' : item.actor.name}</b>
										<span>wrote in</span>
										<a href="/contacts/{item.anchor.id}/journal" class="font-medium text-fg hover:underline">{item.anchor.name}</a>’s journal
										{#if item.visibility === 'private'}<span class="inline-flex items-center gap-1 text-[11px] text-fg-subtle" title="Only you can see this"><Icon name="private" size={11} />private</span>{/if}
										<span class="ml-auto whitespace-nowrap text-xs text-fg-subtle" title={item.entryDate}>{ago(item.at)}</span>
									</div>
									<div class="note-body mt-1 text-fg">{@html item.bodyHtml}</div>
									{#if item.photoIds.length}
										<div class="mt-2 flex gap-1.5">
											{#each item.photoIds as photoId (photoId)}
												<a href="/media/{photoId}" target="_blank" rel="noreferrer" class="block overflow-hidden rounded-md border border-border">
													<img src="/media/{photoId}?thumb" alt="" loading="lazy" class="size-16 object-cover" />
												</a>
											{/each}
										</div>
									{/if}
									{#if item.mentions.length}
										<div class="mt-1.5 flex flex-wrap gap-1.5">
											{#each item.mentions as m (m.id)}
												<a href="/contacts/{m.id}" class="inline-flex items-center gap-1.5 rounded-full bg-bg-sunken py-0.5 pl-1 pr-2 text-xs text-fg-muted hover:text-fg">
													<Avatar id={m.id} name={m.name} avatarPhotoId={m.avatarPhotoId} size={18} />{m.name}
												</a>
											{/each}
										</div>
									{/if}
								</div>
							{:else if item.kind === 'person'}
								<Avatar id={item.person.id} name={item.person.name} avatarPhotoId={item.person.avatarPhotoId} size={32} />
								<div class="min-w-0">
									<div class="flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-fg-muted">
										<b class="font-semibold text-fg">{item.mine ? 'You' : item.actor.name}</b>
										<span>added</span>
										<a href="/contacts/{item.person.id}" class="font-medium text-fg hover:underline">{item.person.name}</a>
										<span class="rounded bg-success/16 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-success">New person</span>
										{#if item.visibility === 'private'}<span class="inline-flex items-center gap-1 text-[11px] text-fg-subtle" title="Only you can see this"><Icon name="private" size={11} />private</span>{/if}
										<span class="ml-auto whitespace-nowrap text-xs text-fg-subtle">{ago(item.at)}</span>
									</div>
									{#if item.description}<p class="mt-0.5 text-sm text-fg-muted">{item.description}</p>{/if}
								</div>
							{:else if item.kind === 'interaction'}
								{@const kind = KIND_PRESENTATION[item.interactionKind]}
								<Avatar id={item.subject.id} name={item.subject.name} avatarPhotoId={item.subject.avatarPhotoId} size={32} />
								<div class="min-w-0">
									<div class="flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-fg-muted">
										<b class="font-semibold text-fg">{item.mine ? 'You' : item.actor.name}</b>
										<span>logged</span>
										<span class="inline-flex items-center gap-1 font-semibold" style="color:{kind.accent}"><Icon name={kind.icon} size={12} />{kind.label.toLowerCase()}</span>
										<span>with</span>
										<a href="/contacts/{item.subject.id}#interactions" class="font-medium text-fg hover:underline">{item.subject.name}</a>
										{#if item.visibility === 'private'}<span class="inline-flex items-center gap-1 text-[11px] text-fg-subtle" title="Only you can see this"><Icon name="private" size={11} />private</span>{/if}
										<span class="ml-auto whitespace-nowrap text-xs text-fg-subtle" title={item.happenedAt}>{ago(item.at)}</span>
									</div>
									{#if item.title}<p class="mt-0.5 text-sm text-fg">{item.title}</p>{/if}
									{#if item.participants.length}
										<div class="mt-1.5 flex flex-wrap gap-1.5">
											{#each item.participants as m (m.id)}
												<a href="/contacts/{m.id}" class="inline-flex items-center gap-1.5 rounded-full bg-bg-sunken py-0.5 pl-1 pr-2 text-xs text-fg-muted hover:text-fg">
													<Avatar id={m.id} name={m.name} avatarPhotoId={m.avatarPhotoId} size={18} />{m.name}
												</a>
											{/each}
										</div>
									{/if}
								</div>
							{:else}
								<Avatar id={item.from.id} name={item.from.name} avatarPhotoId={item.from.avatarPhotoId} size={32} />
								<div class="min-w-0">
									<div class="flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-fg-muted">
										<b class="font-semibold text-fg">{item.mine ? 'You' : item.actor.name}</b>
										<span>linked</span>
										<a href="/contacts/{item.from.id}" class="font-medium text-fg hover:underline">{item.from.name}</a>
										<span class="text-fg-subtle">→</span>
										<span>{item.label}</span>
										<a href="/contacts/{item.to.id}" class="font-medium text-fg hover:underline">{item.to.name}</a>
										<span class="rounded bg-link/16 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-link">Relationship</span>
										<span class="ml-auto whitespace-nowrap text-xs text-fg-subtle">{ago(item.at)}</span>
									</div>
								</div>
							{/if}
						</article>
					{/each}
				</li>
			{/each}
		</ol>
	{:else}
		<div class="rounded-app border border-dashed border-border p-10 text-center">
			<p class="text-fg-muted">Nothing here yet.</p>
			<p class="mt-1 text-sm text-fg-subtle">Write the first moment above — mention someone with @ to get started.</p>
		</div>
	{/if}
</main>
