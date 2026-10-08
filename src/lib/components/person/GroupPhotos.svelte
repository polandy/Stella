<script lang="ts">
	import { dayLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { photoDay } from '$lib/image/taken-at';
	import { thumbnailUrl } from '$lib/media/urls';
	import type { PersonPageData } from './types';

	/*
	 * *On group photos* (docs/02 §2.14): every group photo the person's picture was cut from, now
	 * and before, each a link to its circle. A grid that wraps, never a strip that scrolls sideways.
	 */
	let { photos }: { photos: PersonPageData['groupPhotos'] } = $props();

	const i18n = useI18n();
	const t = i18n.t;
</script>

<div class="mt-4 flex flex-col gap-2" data-testid="on-group-photos">
	<h3 class="text-sm font-semibold text-fg">{t('contact.photos.onGroupPhotos')}</h3>
	<ul class="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
		{#each photos as g (g.id)}
			<li class="min-w-0">
				<a
					href="/circles/{g.circleId}"
					class="flex flex-col gap-1 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
				>
					<img
						src={thumbnailUrl(g.id)}
						alt={t('contact.photos.groupPhotoOf', { circle: g.circleName })}
						class="aspect-[4/3] w-full rounded-control bg-bg-sunken object-cover"
						loading="lazy"
					/>
					<span class="truncate text-xs text-fg-muted">{g.circleName}</span>
					<span class="truncate text-[0.6875rem] text-fg-subtle">
						{dayLabel(i18n, photoDay(g))}
					</span>
				</a>
			</li>
		{/each}
	</ul>
</div>
