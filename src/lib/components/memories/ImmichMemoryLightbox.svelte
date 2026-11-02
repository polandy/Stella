<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import LightboxFrame from '$lib/components/person/LightboxFrame.svelte';
	import { dayLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { ImmichMemoryPhoto } from '$lib/immich/on-this-day';
	import { photoAfterKey } from '$lib/media/photo-walk';

	/*
	 * An Immich photo of *On this day* (docs/02 §2.12.1), opened from the band or a year card: when
	 * it was taken, where it is in its row, and *Open in Immich*. It walks the Immich photos of the
	 * row it was opened from, wrapping at either end. Any photo of the day counts, so there is no
	 * person it belongs to — nor a *Use as photo*.
	 */
	interface Props {
		photos: readonly ImmichMemoryPhoto[];
		at: number;
		onwalk: (at: number) => void;
		onclose: () => void;
	}
	let { photos, at, onwalk, onclose }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const photo = $derived(photos[at]);

	/** The day and the time on the camera's clock, as it was taken. */
	const taken = $derived(
		photo?.takenAt
			? t('memories.immich.takenAt', {
					date: dayLabel(i18n, photo.takenAt.slice(0, 10)),
					time: photo.takenAt.slice(11, 16)
				})
			: t('immich.strip.undated')
	);

	function step(key: string) {
		const next = photoAfterKey({ key, at, count: photos.length, typing: false });
		if (next !== null) onwalk(next);
	}
</script>

{#if photo}
	<LightboxFrame
		label={t('contact.photos.dialog')}
		{onclose}
		onkeydown={(event) => step(event.key)}
		testid="memory-lightbox"
	>
		<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
			<p class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg">
				<span
					class="rounded-full bg-bg-sunken px-2 py-0.5 text-[0.6875rem] font-medium text-fg-muted"
					>{t('contact.photos.sourceImmich')}</span
				>
				<span class="text-xs text-fg-subtle" data-testid="memory-lightbox-date">{taken}</span>
			</p>
			<div class="flex items-center gap-1">
				<Button
					variant="ghost"
					size="sm"
					icon="back"
					label={t('contact.photos.previous')}
					disabled={photos.length < 2}
					onclick={() => step('ArrowLeft')}
				/>
				<span class="text-xs text-fg-subtle tabular-nums" data-testid="memory-lightbox-position">
					{t('contact.photos.position', { at: at + 1, count: photos.length })}
				</span>
				<Button
					variant="ghost"
					size="sm"
					icon="forward"
					label={t('contact.photos.next')}
					disabled={photos.length < 2}
					onclick={() => step('ArrowRight')}
				/>
				<Button variant="ghost" size="sm" onclick={onclose}>{t('common.close')}</Button>
			</div>
		</div>
		<img
			src={photo.previewUrl}
			alt={t('memories.immich.photo', { year: photo.year })}
			class="max-h-[65vh] w-full rounded-control bg-bg-sunken object-contain"
		/>
		<a
			href={photo.openUrl}
			target="_blank"
			rel="noopener noreferrer"
			class="ml-auto inline-flex items-center gap-1 text-sm font-medium text-link hover:underline"
			data-testid="memory-lightbox-open"
		>
			{t('immich.row.open')}<Icon name="openElsewhere" size={13} />
		</a>
	</LightboxFrame>
{/if}
