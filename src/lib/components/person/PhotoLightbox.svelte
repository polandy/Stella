<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import FrameAsAvatar from '$lib/components/person/FrameAsAvatar.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { dayLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { photoDay } from '$lib/media/taken-at';
	import { mediaUrl } from '$lib/media/urls';
	import { photoAfterKey } from '$lib/media/photo-walk';
	import GalleryPhotoActions from './GalleryPhotoActions.svelte';
	import LightboxFrame from './LightboxFrame.svelte';
	import UseImmichPhoto from './UseImmichPhoto.svelte';
	import type { CardEntry, PersonPageData } from './types';

	/*
	 * The person page's one lightbox (docs/02 §2.14, §2.24.3), for a gallery photo and a photo
	 * from Immich alike. It walks the list its tile was opened from — *All*, the gallery, Immich, or
	 * the photos of two people together — with the buttons or the arrow keys, wrapping at either
	 * end, and says where each photo lives. *Use as photo* leads for both: a gallery photo is
	 * framed, an Immich one copied in (§2.24.6). A gallery photo keeps its pin, caption, scope and
	 * removal; an Immich photo offers *Open in Immich* and changes nothing else.
	 */
	interface Props {
		data: PersonPageData;
		/** The list the photo was opened from. */
		photos: readonly CardEntry[];
		/** The photo open, as its place in `photos`. */
		at: number;
		/** Walks to another photo of the list. */
		onwalk: (at: number) => void;
		/** Closes the lightbox; the card hands focus back to the photo's tile. */
		onclose: () => void;
	}
	let { data, photos, at, onwalk, onclose }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const c = $derived(data.contact);
	const entry = $derived(photos[at]);

	/** The day the photo shows: taken when known, else (for the gallery) added. */
	const shownDay = $derived.by(() => {
		if (!entry) return null;
		if (entry.source === 'stella') {
			const day = dayLabel(i18n, photoDay(entry.photo));
			return entry.photo.takenAt === null ? day : t('contact.photos.takenOn', { date: day });
		}
		return entry.photo.takenOn === null
			? t('immich.strip.undated')
			: t('contact.photos.takenOn', { date: dayLabel(i18n, entry.photo.takenOn) });
	});

	const alt = $derived.by(() => {
		if (!entry) return '';
		if (entry.source === 'stella') {
			return entry.photo.caption ?? t('contact.photos.of', { name: c.displayName });
		}
		return entry.photo.takenOn === null
			? t('contact.photos.of', { name: c.displayName })
			: t('immich.strip.photo', { date: dayLabel(i18n, entry.photo.takenOn) });
	});

	function step(key: string, typing = false) {
		const next = photoAfterKey({ key, at, count: photos.length, typing });
		if (next !== null) onwalk(next);
	}

	function onkeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement;
		// A caption field owns the arrows: they move its caret, not the photo (docs/05 §5.9).
		step(event.key, target.matches('input, textarea') || target.isContentEditable);
	}
</script>

{#if entry}
	<LightboxFrame label={t('contact.photos.dialog')} {onclose} {onkeydown} testid="photo-lightbox">
		<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
			<p class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg">
				<span
					class="rounded-full bg-bg-sunken px-2 py-0.5 text-[0.6875rem] font-medium text-fg-muted"
					data-testid="photo-source"
				>
					{entry.source === 'stella'
						? t('contact.photos.sourceStella')
						: t('contact.photos.sourceImmich')}
				</span>
				{#if entry.source === 'stella'}
					<span class="truncate">{entry.photo.caption ?? t('contact.photos.noCaption')}</span>
				{/if}
				<span class="text-xs text-fg-subtle" data-testid="photo-date">{shownDay}</span>
				{#if entry.source === 'stella' && entry.photo.pinnedAt !== null}
					<span class="inline-flex items-center gap-1 text-xs font-medium text-primary">
						<Icon name="pinned" size={11} />{t('contact.photos.favourite')}
					</span>
				{/if}
				{#if entry.source === 'stella' && entry.photo.visibility === 'private'}
					<span class="inline-flex items-center gap-1 text-xs text-fg-subtle">
						<Icon name="private" size={11} />{t('common.privateInline')}
					</span>
				{/if}
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
				<span class="text-xs text-fg-subtle tabular-nums" data-testid="photo-position">
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
			src={entry.source === 'stella' ? mediaUrl(entry.photo.id) : entry.photo.previewUrl}
			{alt}
			class="max-h-[65vh] w-full rounded-control bg-bg-sunken object-contain"
			data-testid="lightbox-photo"
		/>
		{#if entry.source === 'stella' && entry.photo.cutFrom}
			<!-- A profile picture cut from a group photo, kept as a photo of their own (docs/02 §2.14). -->
			<a
				href="/circles/{entry.photo.cutFrom.circleId}"
				class="inline-flex items-center gap-1 self-start text-xs text-primary underline-offset-2 hover:underline"
				data-testid="photo-cut-from"
			>
				<Icon name="circles" size={12} />{t('contact.photos.cutFrom', {
					circle: entry.photo.cutFrom.circleName
				})}
			</a>
		{/if}

		<div class="flex flex-wrap items-center gap-2">
			{#if entry.source === 'stella'}
				{#key entry.photo.id}
					<FrameAsAvatar
						contactId={c.id}
						photoId={entry.photo.id}
						isAvatar={entry.photo.isAvatar}
						framing={entry.photo.framing}
					/>
				{/key}
				<GalleryPhotoActions photo={entry.photo} viewerId={data.viewerId} />
			{:else}
				{#key entry.photo.id}
					<UseImmichPhoto
						contactId={c.id}
						previewUrl={entry.photo.previewUrl}
						hasPhoto={c.avatarPhotoId !== null}
						ondone={onclose}
					/>
				{/key}
				<a
					href={entry.photo.openUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="ml-auto inline-flex items-center gap-1 text-sm font-medium text-link hover:underline"
					data-testid="immich-viewer-open"
				>
					{t('immich.row.open')}<Icon name="openElsewhere" size={13} />
				</a>
			{/if}
		</div>
	</LightboxFrame>
{/if}
