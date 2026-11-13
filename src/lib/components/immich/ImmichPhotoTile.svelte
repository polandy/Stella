<!--
  @component
  An Immich photo an entry refers to (docs/04 ADR-132), shown through Stella's signed proxy and
  opening at preview size. When Immich is not connected, cannot be reached or no longer has the
  photo, the tile says so in place of a broken image.
-->
<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { EntryImmichPhoto } from '$lib/immich/library';
	import type { Attachment } from 'svelte/attachments';

	interface Props {
		photo: EntryImmichPhoto;
		alt: string;
		/** The tile's size and frame. */
		class: string;
		/** Whether the tile opens the photo; off inside the editor. */
		link?: boolean;
	}

	let { photo, alt, class: frame, link = true }: Props = $props();

	const t = useTranslate();
	let failed = $state(false);
	const shown = $derived(!failed && photo.thumbnailUrl !== null);

	// A server-rendered image may fail before hydration, when an `onerror` would miss it.
	const watchFailure: Attachment<HTMLImageElement> = (img) => {
		if (img.complete && img.naturalWidth === 0) failed = true;
		const fail = () => (failed = true);
		img.addEventListener('error', fail);
		return () => img.removeEventListener('error', fail);
	};
</script>

{#if !shown}
	<span
		role="img"
		aria-label={t('journal.immichPhotoUnavailable')}
		title={t('journal.immichPhotoUnavailable')}
		class="{frame} bg-sunken grid place-items-center rounded-app border border-dashed border-border text-fg-subtle"
		data-testid="immich-photo-unavailable"
	>
		<Icon name="offline" size={20} />
	</span>
{:else if link && photo.previewUrl}
	<a
		href={photo.previewUrl}
		target="_blank"
		rel="noreferrer"
		class="block overflow-hidden rounded-app border border-border"
	>
		<img
			src={photo.thumbnailUrl}
			{alt}
			loading="lazy"
			{@attach watchFailure}
			class="{frame} object-cover transition-transform hover:scale-105"
		/>
	</a>
{:else}
	<img
		src={photo.thumbnailUrl}
		{alt}
		loading="lazy"
		{@attach watchFailure}
		class="{frame} object-cover"
	/>
{/if}
