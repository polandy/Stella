import type { Visibility } from '../../../access/visibility';
import type { Clock } from '../../../clock';
import type { MediaStore, PhotoRepository } from '../../media/avatars';
import { validateImageUpload, type ImageUpload } from '../../media/journal-photos';

/*
 * Photos of a Monica import (docs/02 §2.16). The dump only names the files; their bytes are
 * picked from Monica's storage folder in the browser, downscaled there like every other
 * upload (docs/04: no native image library on the server), and sent one by one. Each lands
 * under the plan's stable photo id, so a retried upload is a no-op rather than a duplicate.
 */

export interface ImportedPhotoDeps {
	photos: PhotoRepository;
	media: MediaStore;
	clock: Clock;
}

export interface AttachImportedPhotoInput {
	/** The plan's stable id (`monica:photo:<id>`). */
	photoId: string;
	contactId: string;
	householdId: string;
	userId: string;
	visibility: Visibility;
	/** Whether Monica used this photo as the contact's avatar. */
	isAvatar: boolean;
	upload: ImageUpload;
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Store one imported photo; returns whether it was stored now or was already there. */
export async function attachImportedPhoto(
	deps: ImportedPhotoDeps,
	input: AttachImportedPhotoInput
): Promise<'stored' | 'already'> {
	const mime = validateImageUpload(input.upload);
	if (await deps.photos.exists(input.photoId)) return 'already';
	const ext = EXT[mime]!;
	const filePath = await deps.media.put(`${input.photoId}.${ext}`, input.upload.image);
	const thumbPath = await deps.media.put(`${input.photoId}_thumb.${ext}`, input.upload.thumb);
	await deps.photos.insert({
		id: input.photoId,
		householdId: input.householdId,
		contactId: input.contactId,
		journalEntryId: null,
		createdBy: input.userId,
		visibility: input.visibility,
		filePath,
		thumbPath,
		mime,
		width: input.upload.width,
		height: input.upload.height,
		sizeBytes: input.upload.image.byteLength,
		createdAt: deps.clock.now()
	});
	if (input.isAvatar) await deps.photos.setContactAvatar(input.contactId, input.photoId);
	return 'stored';
}
