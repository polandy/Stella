<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import StreamMoment from '$lib/components/stream/StreamMoment.svelte';
	import TagChip from '$lib/components/journal/TagChip.svelte';
	import { TAGS_PAGE, tagPageHref } from '$lib/hashtags/hashtags';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { streamDays, streamTime } from '$lib/stream/days';
	import type { PageData } from './$types';

	/*
	 * A tag's own page (docs/02 §2.20.2, docs/design/screens/tags.md): the moments carrying it,
	 * by day as on Home. A person's name opens their journal narrowed to the same tag.
	 */
	let { data }: { data: PageData } = $props();

	const i18n = useI18n();
	const t = i18n.t;

	// Read against the clock at the moment it is drawn, as Home's stream is.
	const stream = $derived.by(() => {
		const now = Date.now();
		return {
			days: streamDays(i18n, data.stream, now),
			when: (at: number) => streamTime(i18n, at, now)
		};
	});
</script>

<svelte:head><title>{t('common.pageTitle', { page: `#${data.tag.name}` })}</title></svelte:head>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
	{#if data.summary}
		{@const summary = data.summary}
		<header class="flex flex-wrap items-center justify-between gap-3">
			<div class="flex flex-col gap-1.5">
				<h1 class="sr-only">#{summary.name}</h1>
				<div>
					<TagChip
						tag={{
							key: summary.key,
							name: summary.name,
							count: summary.moments,
							onlyPrivate: summary.onlyPrivate
						}}
						href={tagPageHref(summary.key)}
						size="lg"
					/>
				</div>
				<p class="text-sm text-fg-muted" data-testid="tag-summary">
					{t('journal.tags.summary', { moments: summary.moments, people: summary.people })}
				</p>
			</div>
			<a href={TAGS_PAGE} class="text-sm font-medium text-link hover:underline"
				>{t('journal.tags.allTags')}</a
			>
		</header>
		<ol class="flex flex-col" data-testid="tag-stream">
			{#each stream.days as day (day.label)}
				<li>
					<div
						class="flex items-center gap-3 pt-4 pb-1.5 text-xs font-semibold tracking-wider text-fg-subtle uppercase"
					>
						{day.label}<span class="h-px flex-1 bg-border"></span>
					</div>
					{#each day.items as item (item.kind + item.id)}
						<article
							class="group grid grid-cols-[32px_1fr] gap-3 rounded-app px-2.5 py-2.5 transition-colors hover:bg-card"
						>
							<StreamMoment
								{item}
								members={data.members}
								when={stream.when(item.at)}
								tag={data.key}
							/>
						</article>
					{/each}
				</li>
			{/each}
		</ol>
	{:else}
		<EmptyState
			icon="write"
			title={t('journal.tags.unknown', { name: data.tag.name })}
			hint={t('journal.tags.noneHint')}
		>
			<Button variant="secondary" href={TAGS_PAGE}>{t('journal.tags.allTags')}</Button>
		</EmptyState>
	{/if}
</main>
