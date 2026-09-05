import type { Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';

/*
 * Avatar media domain (docs/02 §2.14, M1). Images are cropped/resized/EXIF-stripped in the
 * browser (a deliberate choice — no server-side native image dep, runs identically in dev and
 * prod); the server's job here is to *validate* the uploaded bytes and store them behind the
 * visibility model. Pure validation plus the setContactAvatar use-case over storage/repository
 * ports (docs/08 §8.3), tested with fakes — no filesystem or DB.
 */

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

export const AVATAR_MAX_BYTES = 3_000_000; // generous cap for a ~512px processed avatar
export const THUMB_MAX_BYTES = 400_000;

const EXT: Record<ImageMime, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp'
};

/** Identify an image purely from its magic bytes — never trust a client-declared type. */
export function sniffImageMime(bytes: Uint8Array): ImageMime | null {
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
		return 'image/jpeg';
	}
	if (
		bytes.length >= 8 &&
		bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
	) {
		return 'image/png';
	}
	if (
		bytes.length >= 12 &&
		bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // RIFF
		bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50 // WEBP
	) {
		return 'image/webp';
	}
	return null;
}

export class InvalidAvatarError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'InvalidAvatarError';
	}
}

export interface AvatarUpload {
	image: Uint8Array;
	thumb: Uint8Array;
	width: number;
	height: number;
}

/** Validate an avatar upload and return its true (sniffed) mime; throws InvalidAvatarError. */
export function validateAvatarUpload(upload: AvatarUpload): ImageMime {
	if (upload.image.byteLength === 0) throw new InvalidAvatarError('The image is empty.');
	if (upload.image.byteLength > AVATAR_MAX_BYTES) throw new InvalidAvatarError('The image is too large.');
	if (upload.thumb.byteLength === 0) throw new InvalidAvatarError('The thumbnail is empty.');
	if (upload.thumb.byteLength > THUMB_MAX_BYTES) throw new InvalidAvatarError('The thumbnail is too large.');

	const mime = sniffImageMime(upload.image);
	if (!mime) throw new InvalidAvatarError('Unsupported image format.');
	if (sniffImageMime(upload.thumb) !== mime) throw new InvalidAvatarError('Thumbnail format mismatch.');
	if (!Number.isInteger(upload.width) || !Number.isInteger(upload.height) || upload.width <= 0 || upload.height <= 0) {
		throw new InvalidAvatarError('Invalid image dimensions.');
	}
	return mime;
}

// ── Ports ─────────────────────────────────────────────────────────────────

export interface StoredPhoto {
	id: string;
	householdId: string;
	contactId: string;
	/** Set when the photo belongs to a journal entry rather than the gallery (§2.20). */
	journalEntryId: string | null;
	createdBy: string;
	visibility: 'shared' | 'private';
	filePath: string;
	thumbPath: string;
	mime: string;
	width: number | null;
	height: number | null;
	sizeBytes: number | null;
	createdAt: number;
}

/** A stored file resolved for serving. */
export interface PhotoFile {
	path: string;
	mime: string;
}

/** One photo in a contact's gallery (docs/02 §2.14), resolved for rendering. */
export interface GalleryPhoto {
	id: string;
	contactId: string;
	caption: string | null;
	visibility: 'shared' | 'private';
	createdBy: string;
	width: number | null;
	height: number | null;
	createdAt: number;
	/** Whether this photo is the contact's current avatar. */
	isAvatar: boolean;
}

/** The file paths a deleted photo leaves behind, so the bytes can go too. */
export interface DeletedPhotoFiles {
	filePath: string;
	thumbPath: string;
}

/** A journal photo reference resolved for rendering (media id + which entry it belongs to). */
export interface JournalPhotoRef {
	id: string;
	journalEntryId: string;
}

export interface PhotoRepository {
	insert(photo: StoredPhoto): Promise<void>;
	/** Whether a photo with this id is already stored (imports use stable ids). */
	exists(id: string): Promise<boolean>;
	setContactAvatar(contactId: string, photoId: string): Promise<void>;
	/** The avatar file (full or thumb) for a photo, only if the viewer may see it (docs/03 §3.7). */
	getVisiblePhotoFile(viewer: Viewer, photoId: string, variant: 'full' | 'thumb'): Promise<PhotoFile | null>;
	/** Journal photos on a contact the viewer may see, oldest first (docs/02 §2.20). */
	listJournalPhotos(viewer: Viewer, contactId: string): Promise<JournalPhotoRef[]>;
	/** Gallery photos on a contact the viewer may see, newest first (docs/02 §2.14). */
	listGalleryPhotos(viewer: Viewer, contactId: string): Promise<GalleryPhoto[]>;
	/** One gallery photo, only if it belongs to that contact and the viewer may see it. */
	findVisibleGalleryPhoto(viewer: Viewer, contactId: string, photoId: string): Promise<GalleryPhoto | null>;
	/** Change the caption and/or visibility of a photo the author uploaded; false if not theirs. */
	updateOwnGalleryPhoto(input: {
		authorId: string;
		photoId: string;
		caption?: string | null;
		visibility?: 'shared' | 'private';
	}): Promise<boolean>;
	/**
	 * Remove a gallery photo the author uploaded and return its files. Clearing the avatar
	 * that pointed at it happens in the same transaction, so a deleted photo can never leave
	 * a contact wearing a face that no longer exists.
	 */
	deleteOwnGalleryPhoto(input: { authorId: string; photoId: string }): Promise<DeletedPhotoFiles | null>;
}

/** Byte storage under the media volume; paths returned are what the DB records. */
export interface MediaStore {
	put(key: string, bytes: Uint8Array): Promise<string>;
	read(path: string): Promise<Uint8Array | null>;
	delete(path: string): Promise<void>;
}

export interface AvatarDeps {
	photos: PhotoRepository;
	media: MediaStore;
	ids: IdGenerator;
	clock: Clock;
}

export interface AvatarUploader {
	userId: string;
	householdId: string;
}

// ── Use-case ────────────────────────────────────────────────────────────────

/**
 * Store a new avatar for a contact and make it the contact's avatar. The caller must have
 * already confirmed the contact is visible to the uploader. Avatars are shared (a shared
 * contact's face should be recognizable to the household). Returns the new photo id.
 */
export async function setContactAvatar(
	deps: AvatarDeps,
	uploader: AvatarUploader,
	contactId: string,
	upload: AvatarUpload
): Promise<string> {
	const mime = validateAvatarUpload(upload);
	const id = deps.ids.next();
	const ext = EXT[mime];

	const filePath = await deps.media.put(`${id}.${ext}`, upload.image);
	const thumbPath = await deps.media.put(`${id}_thumb.${ext}`, upload.thumb);

	await deps.photos.insert({
		id,
		householdId: uploader.householdId,
		contactId,
		journalEntryId: null,
		createdBy: uploader.userId,
		visibility: 'shared',
		filePath,
		thumbPath,
		mime,
		width: upload.width,
		height: upload.height,
		sizeBytes: upload.image.byteLength,
		createdAt: deps.clock.now()
	});
	await deps.photos.setContactAvatar(contactId, id);
	return id;
}
