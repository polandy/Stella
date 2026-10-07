<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { dayLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { GlimpsePhoto } from '$lib/immich/strip';
	import LightboxFrame from './LightboxFrame.svelte';
	import UseImmichPhoto from './UseImmichPhoto.svelte';

	/*
	 * A photo from the Immich strip, in the person page's lightbox (docs/02 §2.24.3):
	 * Immich's `preview` size, through Stella's signed proxy, so it works for every member whatever
	 * their own Immich account. Left and right — the buttons or the arrow keys — walk the strip.
	 * *Open in Immich* takes anyone to the photo there; only the key owner's session shows it
	 * (docs/04 ADR-102). *Use as photo* cuts a square of it into the person's own photo (docs/02
	 * §2.24.6) — a copy a member makes on purpose; the photo itself stays Immich's.
	 */
	interface Props {
		photo: GlimpsePhoto;
		/** Its place in the strip, from 0. */
		at: number;
		/** How many photos the strip holds now. */
		count: number;
		/** The person whose photo it is, for the picture's description. */
		name: string;
		contactId: string;
		/** Whether the person wears a photo now. */
		hasPhoto: boolean;
		/** Closes the viewer and hands focus back to the photo's tile. */
		onclose: () => void;
		/** One step through the strip, as the arrow key of that name would. */
		onstep: (key: 'ArrowLeft' | 'ArrowRight') => void;
		/** The arrow keys walk the strip. */
		onkeydown: (event: KeyboardEvent) => void;
	}
	let { photo, at, count, name, contactId, hasPhoto, onclose, onstep, onkeydown }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const taken = $derived(photo.takenOn === null ? null : dayLabel(i18n, photo.takenOn));
</script>

<LightboxFrame label={t('immich.viewer.dialog')} {onclose} {onkeydown} testid="immich-viewer">
	<div class="flex items-center justify-between gap-3">
		<p class="truncate text-sm text-fg">
			{taken === null ? t('immich.strip.undated') : t('contact.photos.takenOn', { date: taken })}
			<span class="ml-2 text-xs text-fg-subtle" data-testid="immich-viewer-position">
				{t('immich.viewer.position', { at: at + 1, count })}
			</span>
		</p>
		<Button variant="ghost" size="sm" onclick={onclose}>{t('common.close')}</Button>
	</div>

	<img
		src={photo.previewUrl}
		alt={taken === null
			? t('contact.photos.of', { name })
			: t('immich.strip.photo', { date: taken })}
		class="max-h-[65vh] w-full rounded-control bg-bg-sunken object-contain"
		data-testid="immich-viewer-photo"
	/>

	<div class="flex flex-wrap items-center gap-2">
		<Button
			variant="ghost"
			size="sm"
			icon="back"
			label={t('immich.viewer.previous')}
			disabled={count < 2}
			onclick={() => onstep('ArrowLeft')}
		/>
		<Button
			variant="ghost"
			size="sm"
			icon="forward"
			label={t('immich.viewer.next')}
			disabled={count < 2}
			onclick={() => onstep('ArrowRight')}
		/>
		<UseImmichPhoto {contactId} previewUrl={photo.previewUrl} {hasPhoto} ondone={onclose} />
		<a
			href={photo.openUrl}
			target="_blank"
			rel="noopener noreferrer"
			class="ml-auto inline-flex items-center gap-1 text-sm font-medium text-link hover:underline"
			data-testid="immich-viewer-open"
		>
			{t('immich.row.open')}<Icon name="openElsewhere" size={13} />
		</a>
	</div>
</LightboxFrame>
