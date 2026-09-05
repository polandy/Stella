import type { Viewer, Visibility } from '../../access/visibility';
import type { GalleryPhoto, MediaStore, PhotoRepository } from './avatars';

/*
 * The photo gallery on a person (docs/02 §2.14).
 *
 * Reading is scoped by the repository through the central visibility rules; writing is
 * scoped here to the person who uploaded the photo, the same rule notes and journal entries
 * follow (§2.10). Use-cases over the ports, so every rule is testable without a route.
 */

/** Longest caption accepted; a caption is a line under a photo, not a note. */
export const CAPTION_MAX_LENGTH = 280;

export class CaptionTooLongError extends Error {
	constructor() {
		super(`A caption can be at most ${CAPTION_MAX_LENGTH} characters.`);
		this.name = 'CaptionTooLongError';
	}
}

export interface GalleryDeps {
	photos: PhotoRepository;
	media: MediaStore;
}

/** The gallery photos of a contact that this viewer may see, newest first. */
export async function listGallery(
	deps: Pick<GalleryDeps, 'photos'>,
	viewer: Viewer,
	contactId: string
): Promise<GalleryPhoto[]> {
	return deps.photos.listGalleryPhotos(viewer, contactId);
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
	const files = await deps.photos.deleteOwnGalleryPhoto({ authorId: viewer.id, photoId });
	if (!files) return false;
	await deps.media.delete(files.filePath);
	await deps.media.delete(files.thumbPath);
	return true;
}

/**
 * Wear a gallery photo as the contact's avatar. The photo must be one of *that* contact's and
 * visible to the viewer, so a guessed id can neither borrow someone else's face nor confirm
 * that a private photo exists.
 */
export async function useAsAvatar(
	deps: Pick<GalleryDeps, 'photos'>,
	viewer: Viewer,
	contactId: string,
	photoId: string
): Promise<boolean> {
	const found = await deps.photos.findVisibleGalleryPhoto(viewer, contactId, photoId);
	if (!found) return false;
	await deps.photos.setContactAvatar(contactId, photoId);
	return true;
}
