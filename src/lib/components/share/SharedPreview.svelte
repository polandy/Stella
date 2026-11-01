<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { MAX_SHARED_PHOTOS, type Shared } from '$lib/share/shared';

	/** What arrived, shown before anything is saved: the photos, or the words and the link. */
	let {
		shared,
		previews,
		photosLeftBehind
	}: {
		shared: Exclude<Shared, { kind: 'nothing' }>;
		/** Object URLs of the kept photos; the page owns and revokes them. */
		previews: string[];
		photosLeftBehind: boolean;
	} = $props();

	const t = useI18n().t;
</script>

<section aria-label={t('share.shared')} class="rounded-app bg-card p-3 shadow-card">
	{#if shared.kind === 'photos'}
		<ul class="flex gap-2 overflow-x-auto" data-testid="share-photos">
			{#each previews as preview, i (preview)}
				<li class="shrink-0">
					<img
						src={preview}
						alt={t('share.photo', { n: i + 1 })}
						class="h-28 w-auto max-w-40 rounded-control object-cover"
					/>
				</li>
			{/each}
		</ul>
		<p class="mt-2 text-xs text-fg-muted">
			{t('share.photoCount', { count: shared.count })}
			{#if shared.dropped > 0}
				· {t('share.photosDropped', { max: MAX_SHARED_PHOTOS, dropped: shared.dropped })}
			{/if}
		</p>
	{:else}
		<div class="flex items-center gap-3" data-testid="share-words">
			<span
				class="grid size-11 shrink-0 place-items-center rounded-control bg-bg-sunken text-fg-muted"
			>
				<Icon name={shared.link ? 'link' : 'write'} size={20} />
			</span>
			<div class="min-w-0">
				{#if shared.words}<p class="line-clamp-2 font-semibold text-fg">{shared.words}</p>{/if}
				{#if shared.link}<p class="truncate text-xs text-fg-muted">{shared.link}</p>{/if}
			</div>
		</div>
		{#if photosLeftBehind}
			<p class="mt-2 text-xs text-fg-muted">{t('share.photosLeftBehind')}</p>
		{/if}
	{/if}
</section>
