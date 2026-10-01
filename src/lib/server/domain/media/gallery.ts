import { TranslatableError } from '../../../errors/translatable';
import { phrase } from '../../../i18n/phrase';
import type { Viewer, Visibility } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { GalleryPhoto, MediaStore, PhotoRepository } from './avatars';
import { orderGallery } from './gallery-order';

/*
 * The photo gallery on a person (docs/02 §2.14).
 *
 * Reading is scoped by the repository through the central visibility rules; writing is
 * scoped here to the person who uploaded the photo, the same rule notes and journal entries
 * follow (§2.10). Use-cases over the ports, so every rule is testable without a route.
 */

/** Longest caption accepted; a caption is a line under a photo, not a note. */
export const CAPTION_MAX_LENGTH = 280;

export class CaptionTooLongError extends TranslatableError {
	constructor() {
		super(phrase('errors.caption.tooLong', { max: CAPTION_MAX_LENGTH }), 'CaptionTooLongError');
	}
}

export interface GalleryDeps {
	photos: PhotoRepository;
	media: MediaStore;
	clock: Clock;
}

/** The gallery photos of a contact that this viewer may see: favourites first, then newest first. */
export async function listGallery(
	deps: Pick<GalleryDeps, 'photos'>,
	viewer: Viewer,
	contactId: string
): Promise<GalleryPhoto[]> {
	return orderGallery(await deps.photos.listGalleryPhotos(viewer, contactId));
}

/**
 * Pin a photo as one of a person's favourites, or unpin it (docs/02 §2.14). A pin belongs to
 * the household, like the photo itself (docs/04 §4.9): anyone who can see the photo may pin
 * it, and everyone who sees it sees it pinned. Pinning a photo that is already pinned keeps
 * its first pin, so sending the same pin twice changes nothing. False when the viewer cannot
 * see the photo — the same answer whether or not it exists.
 */
export async function pinGalleryPhoto(
	deps: Pick<GalleryDeps, 'photos' | 'clock'>,
	viewer: Viewer,
	input: { contactId: string; photoId: string; pinned: boolean }
): Promise<boolean> {
	const photo = await deps.photos.findVisibleGalleryPhoto(viewer, input.contactId, input.photoId);
	if (!photo) return false;
	if (input.pinned === (photo.pinnedAt !== null)) return true;
	await deps.photos.setGalleryPhotoPin(photo.id, input.pinned ? deps.clock.now() : null);
	return true;
}

/**
 * Caption a photo. Blank clears it. Returns false when the photo is not the caller's —
 * a caption belongs to whoever put the photo there.
 */
export async function captionGalleryPhoto(
	deps: Pick<GalleryDeps, 'photos'>,
	viewer: Viewer,
	photoId: string,
	caption: string
): Promise<boolean> {
	const trimmed = caption.trim();
	if (trimmed.length > CAPTION_MAX_LENGTH) throw new CaptionTooLongError();
	return deps.photos.updateOwnGalleryPhoto({
		authorId: viewer.id,
		photoId,
		caption: trimmed.length === 0 ? null : trimmed
	});
}

/** Move a photo between shared and private. Only its uploader can. */
export async function setGalleryPhotoVisibility(
	deps: Pick<GalleryDeps, 'photos'>,
	viewer: Viewer,
	photoId: string,
	visibility: Visibility
): Promise<boolean> {
	return deps.photos.updateOwnGalleryPhoto({ authorId: viewer.id, photoId, visibility });
}

/**
 * Delete a photo and its files. The row goes first: if removing the bytes fails, the photo is
 * already gone from every view, which is the harmless direction of that failure.
 */
export async function removeGalleryPhoto(
	deps: GalleryDeps,
	viewer: Viewer,
	photoId: string
): Promise<boolean> {
	const removed = await deps.photos.deleteOwnGalleryPhoto({ authorId: viewer.id, photoId });
	if (!removed) return false;
	for (const files of removed) {
		await deps.media.delete(files.filePath);
		await deps.media.delete(files.thumbPath);
	}
	return true;
}
