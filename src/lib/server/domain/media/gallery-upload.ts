import type { Visibility } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import type { ImageMime, MediaStore, PhotoRepository } from './avatars';
import { validateImageUpload, type ImageUpload } from './journal-photos';

/*
 * Adding a photo to a person's gallery (docs/02 §2.14). The bytes are downscaled and
 * EXIF-stripped in the browser, exactly as for journal photos (§2.20), so the same
 * validation applies here; what differs is that a gallery photo belongs to no entry and
 * carries its own visibility rather than inheriting one.
 */

const EXT: Record<ImageMime, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp'
};

export interface GalleryUploadDeps {
	photos: PhotoRepository;
	media: MediaStore;
	ids: IdGenerator;
	clock: Clock;
}

export interface GalleryUploader {
	userId: string;
	householdId: string;
}

export interface AddGalleryPhotoInput {
	contactId: string;
	visibility: Visibility;
	upload: ImageUpload;
}

/**
 * Validate and store one gallery photo. The caller must have already confirmed the contact is
 * visible to the uploader. Returns the new photo id.
 */
export async function addGalleryPhoto(
	deps: GalleryUploadDeps,
	uploader: GalleryUploader,
	input: AddGalleryPhotoInput
): Promise<string> {
	const mime = validateImageUpload(input.upload);
	const id = deps.ids.next();
	const ext = EXT[mime];

	const filePath = await deps.media.put(`${id}.${ext}`, input.upload.image);
	const thumbPath = await deps.media.put(`${id}_thumb.${ext}`, input.upload.thumb);

	await deps.photos.insert({
		id,
		householdId: uploader.householdId,
		contactId: input.contactId,
		journalEntryId: null,
		createdBy: uploader.userId,
		visibility: input.visibility,
		filePath,
		thumbPath,
		mime,
		width: input.upload.width,
		height: input.upload.height,
		sizeBytes: input.upload.image.byteLength,
		createdAt: deps.clock.now()
	});
	return id;
}
