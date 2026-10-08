<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { INPUT } from './inputs';
	import type { PersonPageData } from './types';

	/*
	 * What the lightbox offers on a gallery photo besides *Use as photo* (docs/02 §2.14): the pin,
	 * which is the household's, and — only on a photo you added — its caption, its scope and its
	 * removal, which sits last so it is never the button next to the one you meant.
	 */
	interface Props {
		photo: PersonPageData['gallery'][number];
		/** Who is looking: only the one who added a photo captions, re-scopes or removes it. */
		viewerId: string;
	}
	let { photo, viewerId }: Props = $props();

	const t = useI18n().t;
</script>

<!-- Anyone who sees the photo may pin it: a favourite is the household's (docs/02 §2.14). -->
<form method="POST" action="?/pinPhoto" class="contents">
	<input type="hidden" name="photoId" value={photo.id} />
	<input type="hidden" name="pinned" value={photo.pinnedAt === null ? 'true' : 'false'} />
	<Button variant="ghost" size="sm" icon="pinned" data-testid="photo-pin">
		{photo.pinnedAt === null ? t('contact.photos.pin') : t('contact.photos.unpin')}
	</Button>
</form>

{#if photo.createdBy === viewerId}
	<form method="POST" action="?/captionPhoto" class="flex flex-1 items-center gap-2">
		<input type="hidden" name="photoId" value={photo.id} />
		<input
			name="caption"
			value={photo.caption ?? ''}
			placeholder={t('contact.photos.captionPlaceholder')}
			aria-label={t('contact.photos.caption')}
			class="min-w-40 flex-1 {INPUT}"
		/>
		<Button variant="secondary" size="sm">{t('common.save')}</Button>
	</form>
	<form method="POST" action="?/setPhotoVisibility" class="contents">
		<input type="hidden" name="photoId" value={photo.id} />
		<input
			type="hidden"
			name="visibility"
			value={photo.visibility === 'private' ? 'shared' : 'private'}
		/>
		<Button variant="ghost" size="sm">
			{photo.visibility === 'private' ? t('contact.photos.share') : t('contact.photos.makePrivate')}
		</Button>
	</form>
	<form method="POST" action="?/removePhoto" class="contents">
		<input type="hidden" name="photoId" value={photo.id} />
		<Button variant="danger" size="sm">{t('common.remove')}</Button>
	</form>
{/if}
