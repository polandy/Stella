<script lang="ts">
	import Veil from '$lib/components/ui/Veil.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { thumbnailUrl } from '$lib/media/urls';
	import type { MemoryPhotoView } from '$lib/memories/view';

	/*
	 * The day's photos in earlier years (docs/02 §2.12.1): one row of square thumbnails, each
	 * with its year, opening the person's Photos card. A private one stays blurred (§2.10.1).
	 */
	let { photos, years = true }: { photos: MemoryPhotoView[]; years?: boolean } = $props();

	const t = useI18n().t;
</script>

<ul class="grid grid-cols-4 gap-1.5" data-testid="memory-photos">
	{#each photos as photo (photo.id)}
		<li class="relative aspect-square max-w-full overflow-hidden rounded-app bg-card">
			<a
				href={photo.href}
				class="block h-full w-full"
				aria-label={t('memories.photoOf', { name: photo.person.name, year: photo.year })}
			>
				<Veil
					id="photo:{photo.id}"
					isPrivate={photo.isPrivate}
					label={t('privacy.veil.photo')}
					photo
					compact
					passive
					class="h-full w-full"
				>
					<img
						src={thumbnailUrl(photo.id)}
						alt=""
						loading="lazy"
						class="h-full w-full object-cover"
					/>
				</Veil>
				{#if years}
					<span
						class="absolute bottom-0.5 left-0.5 rounded-sm bg-bg/80 px-1 text-[10px] font-medium text-fg tabular-nums"
						>{photo.year}</span
					>
				{/if}
			</a>
		</li>
	{/each}
</ul>
