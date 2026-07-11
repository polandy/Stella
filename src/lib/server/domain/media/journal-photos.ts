import type { Visibility } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import { sniffImageMime, type ImageMime, type MediaStore, type PhotoRepository } from './avatars';

/*
 * Journal photo domain (docs/02 §2.20). Like avatars (§2.14), images are downscaled and
 * EXIF/GPS-stripped in the browser, so the server needs no native image library; its job is to
 * validate the bytes (magic-byte sniff + size cap) and store them behind the visibility model.
 * A journal photo inherits its entry's visibility, so a private entry's photos stay private.
 * Pure validation + the attachJournalPhoto use-case over the storage/repository ports.
 */

// Journal photos are full-frame (not tiny avatars), so the caps are more generous.
export const JOURNAL_IMAGE_MAX_BYTES = 6_000_000;
export const JOURNAL_THUMB_MAX_BYTES = 900_000;

const EXT: Record<ImageMime, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp'
};

export class InvalidImageError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'InvalidImageError';
	}
}

export interface ImageUpload {
	image: Uint8Array;
	thumb: Uint8Array;
	width: number;
	height: number;
}

/** Validate a journal image upload and return its true (sniffed) mime; throws InvalidImageError. */
export function validateImageUpload(upload: ImageUpload): ImageMime {
	if (upload.image.byteLength === 0) throw new InvalidImageError('The image is empty.');
	if (upload.image.byteLength > JOURNAL_IMAGE_MAX_BYTES) throw new InvalidImageError('The image is too large.');
	if (upload.thumb.byteLength === 0) throw new InvalidImageError('The thumbnail is empty.');
	if (upload.thumb.byteLength > JOURNAL_THUMB_MAX_BYTES) throw new InvalidImageError('The thumbnail is too large.');

	const mime = sniffImageMime(upload.image);
	if (!mime) throw new InvalidImageError('Unsupported image format.');
	if (sniffImageMime(upload.thumb) !== mime) throw new InvalidImageError('Thumbnail format mismatch.');
	if (
		!Number.isInteger(upload.width) ||
		!Number.isInteger(upload.height) ||
		upload.width <= 0 ||
		upload.height <= 0
	) {
		throw new InvalidImageError('Invalid image dimensions.');
	}
	return mime;
}

export interface JournalPhotoDeps {
	photos: PhotoRepository;
	media: MediaStore;
	ids: IdGenerator;
	clock: Clock;
}

export interface PhotoUploader {
	userId: string;
	householdId: string;
}

export interface AttachJournalPhotoInput {
	contactId: string;
	journalEntryId: string;
	/** The owning entry's visibility — the photo inherits it. */
	visibility: Visibility;
	upload: ImageUpload;
}

/**
 * Store a photo and attach it to a journal entry. The caller must have already confirmed the
 * entry (and its contact) is visible and owned by the uploader. The photo inherits the entry's
 * visibility. Returns the new photo id.
 */
export async function attachJournalPhoto(
	deps: JournalPhotoDeps,
	uploader: PhotoUploader,
	input: AttachJournalPhotoInput
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
		journalEntryId: input.journalEntryId,
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
