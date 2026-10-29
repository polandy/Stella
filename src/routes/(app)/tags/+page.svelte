<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import TagChip from '$lib/components/journal/TagChip.svelte';
	import { tagPageHref } from '$lib/hashtags/hashtags';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { PageData } from './$types';

	/*
	 * Every tag the viewer can see, most used first (docs/02 §2.20.2): the layout has already
	 * read them, scoped and counted, for the tag picker, so this page needs no load of its own.
	 */
	let { data }: { data: PageData } = $props();

	const t = useI18n().t;
</script>

<svelte:head
	><title>{t('common.pageTitle', { page: t('journal.tags.listTitle') })}</title></svelte:head
>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
	<header class="flex flex-col gap-1">
		<h1 class="text-2xl font-semibold text-fg">{t('journal.tags.listTitle')}</h1>
		<p class="text-sm text-fg-muted">{t('journal.tags.listIntro')}</p>
	</header>
	{#if data.entryTags.length}
		<nav
			class="flex flex-wrap gap-2"
			aria-label={t('journal.tags.listTitle')}
			data-testid="tag-list"
		>
			{#each data.entryTags as tag (tag.key)}
				<TagChip {tag} href={tagPageHref(tag.key)} size="lg" />
			{/each}
		</nav>
		<p class="text-sm text-fg-muted">{t('journal.tags.listHint')}</p>
	{:else}
		<EmptyState
			icon="write"
			title={t('journal.tags.listEmpty')}
			hint={t('journal.tags.noneHint')}
		/>
	{/if}
</main>
