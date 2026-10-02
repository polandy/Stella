<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { thumbnailUrl } from '$lib/media/urls';
	import type { PageData } from '../../routes/(app)/$types';

	/** The stream item as Home's `load` hands it over. */
	type CirclePhotoItem = Extract<PageData['stream'][number], { kind: 'circlePhoto' }>;

	/*
	 * Photos added to a circle, as the household stream shows them (docs/02 §2.11, §2.4.2):
	 * *Anna added 3 photos to Class 1B*, with their thumbnails, linking to the circle. Only the
	 * addition is listed, never a later change; a private photo reaches its uploader's stream only.
	 */
	let {
		item,
		who,
		ago
	}: {
		item: CirclePhotoItem;
		/** The actor's name, or *You*. */
		who: string;
		/** When it happened, as the stream says it. */
		ago: string;
	} = $props();

	const t = useTranslate();
	const count = $derived(item.photoIds.length);
	/** How many thumbnails fit beside each other before the rest is a number. */
	const SHOWN = 4;
	const href = $derived(`/circles/${item.circle.id}#photos`);
</script>

<a {href} class="block size-8 overflow-hidden rounded-md bg-bg-sunken" tabindex="-1" aria-hidden="true">
	<img src={thumbnailUrl(item.photoIds[0]!)} alt="" class="size-full object-cover" loading="lazy" />
</a>
<div class="min-w-0">
	<div class="flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-fg-muted">
		<b class="font-semibold text-fg">{who}</b>
		<span>{t('home.stream.addedPhotoTo', { count })}</span>
		<a {href} class="font-medium text-fg hover:underline">{item.circle.name}</a>
		{#if t('home.stream.addedPhotoToAfter', { count })}<span>{t('home.stream.addedPhotoToAfter', { count })}</span>{/if}
		{#if item.visibility === 'private'}<span class="inline-flex items-center gap-1 text-[11px] text-fg-subtle" title={t('common.onlyYouSee')}><Icon name="private" size={11} />{t('common.privateInline')}</span>{/if}
		<span class="ml-auto whitespace-nowrap text-xs text-fg-subtle">{ago}</span>
	</div>
	{#if item.role}<p class="mt-0.5 text-xs text-fg-subtle">{item.role}</p>{/if}
	<div class="mt-2 flex gap-1.5">
		{#each item.photoIds.slice(0, SHOWN) as photoId (photoId)}
			<a {href} class="block overflow-hidden rounded-md border border-border" tabindex="-1" aria-hidden="true">
				<img src={thumbnailUrl(photoId)} alt="" loading="lazy" class="size-16 object-cover" />
			</a>
		{/each}
		{#if count > SHOWN}
			<span class="grid size-16 place-items-center rounded-md bg-bg-sunken text-sm font-semibold text-fg-muted">+{count - SHOWN}</span>
		{/if}
	</div>
</div>
