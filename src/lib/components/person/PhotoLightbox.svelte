<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import FrameAsAvatar from '$lib/components/FrameAsAvatar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { Dated } from '$lib/image/taken-at';
	import { mediaUrl } from '$lib/media/urls';
	import { INPUT } from './inputs';
	import LightboxFrame from './LightboxFrame.svelte';
	import type { PersonPageData } from './types';

	let {
		data,
		openedPhoto,
		photoDate,
		closePhoto,
		onPhotoKeydown
	}: {
		data: PersonPageData;
		/** The gallery photo being looked at, or null with the lightbox closed. */
		openedPhoto: PersonPageData['gallery'][number] | null;
		/** When a gallery photo was taken, else added, in the viewer's language (docs/02 §2.14). */
		photoDate: (photo: Dated) => string;
		/** Closes the lightbox and hands focus back to the photo's thumbnail. */
		closePhoto: () => void;
		/** The arrow keys walk the grid. */
		onPhotoKeydown: (event: KeyboardEvent) => void;
	} = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const c = $derived(data.contact);
</script>

<!--
	Lightbox (docs/02 §2.14). One overlay for whichever photo is open, in the shared frame: the
	picture, and the few things you might do with it. Only the person who added a photo can
	caption, re-scope or remove it; anyone who can see it can make it the avatar. Escape closes,
	the arrow keys walk the grid, and focus returns to the photo's thumbnail on the way out.
-->
{#if openedPhoto}
	<LightboxFrame
		label={t('contact.photos.dialog')}
		onclose={closePhoto}
		onkeydown={onPhotoKeydown}
		testid="photo-lightbox"
	>
		<div class="flex items-center justify-between gap-3">
			<p class="truncate text-sm text-fg">
				{openedPhoto.caption ?? t('contact.photos.noCaption')}
				<span class="ml-2 text-xs text-fg-subtle" data-testid="photo-date">
					{openedPhoto.takenAt === null
						? photoDate(openedPhoto)
						: t('contact.photos.takenOn', { date: photoDate(openedPhoto) })}
				</span>
				{#if openedPhoto.pinnedAt !== null}
					<span class="ml-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
						<Icon name="pinned" size={11} />{t('contact.photos.favourite')}
					</span>
				{/if}
				{#if openedPhoto.visibility === 'private'}
					<span class="ml-2 inline-flex items-center gap-1 text-xs text-fg-subtle">
						<Icon name="private" size={11} />{t('common.privateInline')}
					</span>
				{/if}
			</p>
			<Button variant="ghost" size="sm" onclick={closePhoto}>{t('common.close')}</Button>
		</div>

		<img
			src={mediaUrl(openedPhoto.id)}
			alt={openedPhoto.caption ?? t('contact.photos.of', { name: c.displayName })}
			class="max-h-[65vh] w-full rounded-control bg-bg-sunken object-contain"
		/>
		{#if openedPhoto.cutFrom}
			<!-- A profile picture cut from a group photo, kept as a photo of their own (circle-photos §5.2). -->
			<a
				href="/circles/{openedPhoto.cutFrom.circleId}"
				class="inline-flex items-center gap-1 self-start text-xs text-primary underline-offset-2 hover:underline"
				data-testid="photo-cut-from"
			>
				<Icon name="circles" size={12} />{t('contact.photos.cutFrom', {
					circle: openedPhoto.cutFrom.circleName
				})}
			</a>
		{/if}

		<div class="flex flex-wrap items-center gap-2">
			<FrameAsAvatar
				contactId={c.id}
				photoId={openedPhoto.id}
				isAvatar={openedPhoto.isAvatar}
				framing={openedPhoto.framing}
			/>

			<!-- Anyone who sees the photo may pin it: a favourite is the household's (docs/02 §2.14). -->
			<form method="POST" action="?/pinPhoto" class="contents">
				<input type="hidden" name="photoId" value={openedPhoto.id} />
				<input
					type="hidden"
					name="pinned"
					value={openedPhoto.pinnedAt === null ? 'true' : 'false'}
				/>
				<Button variant="ghost" size="sm" icon="pinned" data-testid="photo-pin">
					{openedPhoto.pinnedAt === null ? t('contact.photos.pin') : t('contact.photos.unpin')}
				</Button>
			</form>

			{#if openedPhoto.createdBy === data.viewerId}
				<form method="POST" action="?/captionPhoto" class="flex flex-1 items-center gap-2">
					<input type="hidden" name="photoId" value={openedPhoto.id} />
					<input
						name="caption"
						value={openedPhoto.caption ?? ''}
						placeholder={t('contact.photos.captionPlaceholder')}
						aria-label={t('contact.photos.caption')}
						class="min-w-40 flex-1 {INPUT}"
					/>
					<Button variant="secondary" size="sm">{t('common.save')}</Button>
				</form>
				<form method="POST" action="?/setPhotoVisibility" class="contents">
					<input type="hidden" name="photoId" value={openedPhoto.id} />
					<input
						type="hidden"
						name="visibility"
						value={openedPhoto.visibility === 'private' ? 'shared' : 'private'}
					/>
					<Button variant="ghost" size="sm">
						{openedPhoto.visibility === 'private'
							? t('contact.photos.share')
							: t('contact.photos.makePrivate')}
					</Button>
				</form>
				<form method="POST" action="?/removePhoto" class="contents">
					<input type="hidden" name="photoId" value={openedPhoto.id} />
					<Button variant="danger" size="sm">{t('common.remove')}</Button>
				</form>
			{/if}
		</div>
	</LightboxFrame>
{/if}
