import type { CropRect } from '../../../media/crop';
import { TranslatableError } from '../../../i18n/translatable';
import { phrase, type Phrase } from '../../../i18n/phrase';
import type { Remover, Viewer } from '../../access/visibility';
import type { ActivityOf } from '../activity/activity';
import type { RemovableRecord } from '../activity/removal';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import { isPlausibleTakenAt, isTakenAt } from '../../../media/taken-at';

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
		bytes[0] === 0x89 &&
		bytes[1] === 0x50 &&
		bytes[2] === 0x4e &&
		bytes[3] === 0x47
	) {
		return 'image/png';
	}
	if (
		bytes.length >= 12 &&
		bytes[0] === 0x52 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x46 && // RIFF
		bytes[8] === 0x57 &&
		bytes[9] === 0x45 &&
		bytes[10] === 0x42 &&
		bytes[11] === 0x50 // WEBP
	) {
		return 'image/webp';
	}
	return null;
}

export class InvalidAvatarError extends TranslatableError {
	constructor(message: Phrase) {
		super(message, 'InvalidAvatarError');
	}
}

export interface AvatarUpload {
	image: Uint8Array;
	thumb: Uint8Array;
	width: number;
	height: number;
	/** When the picture was taken, read from its EXIF in the browser; absent when it said nothing. */
	takenAt?: string | null;
}

/**
 * An upload's capture date as it is stored (docs/02 §2.14): null when the picture carried none,
 * which is normal; refused through `refuse` when it does not read or cannot be real — the phone
 * drops a date like that before sending, so one arriving was not sent by Stella's own pages.
 */
export function storedTakenAt(
	takenAt: string | null | undefined,
	nowMs: number,
	refuse: (message: Phrase) => Error
): string | null {
	if (takenAt === undefined || takenAt === null) return null;
	if (!isTakenAt(takenAt) || !isPlausibleTakenAt(takenAt, nowMs))
		throw refuse(phrase('errors.image.takenAt'));
	return takenAt;
}

/** Validate an avatar upload and return its true (sniffed) mime; throws InvalidAvatarError. */
export function validateAvatarUpload(upload: AvatarUpload): ImageMime {
	if (upload.image.byteLength === 0) throw new InvalidAvatarError(phrase('errors.image.empty'));
	if (upload.image.byteLength > AVATAR_MAX_BYTES)
		throw new InvalidAvatarError(phrase('errors.image.tooLarge'));
	if (upload.thumb.byteLength === 0)
		throw new InvalidAvatarError(phrase('errors.image.thumbEmpty'));
	if (upload.thumb.byteLength > THUMB_MAX_BYTES)
		throw new InvalidAvatarError(phrase('errors.image.thumbTooLarge'));

	const mime = sniffImageMime(upload.image);
	if (!mime) throw new InvalidAvatarError(phrase('errors.image.unsupportedFormat'));
	if (sniffImageMime(upload.thumb) !== mime)
		throw new InvalidAvatarError(phrase('errors.image.formatMismatch'));
	if (
		!Number.isInteger(upload.width) ||
		!Number.isInteger(upload.height) ||
		upload.width <= 0 ||
		upload.height <= 0
	) {
		throw new InvalidAvatarError(phrase('errors.image.dimensions'));
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
	/** When it was taken, as its EXIF said (`../../../image/taken-at`); null when unknown. */
	takenAt: string | null;
	createdAt: number;
}

/**
 * Which size of a photo to serve: the full picture, the 1600 px view a circle photo keeps beside
 * its larger full picture (docs/02 §2.4.2), or the thumbnail. A photo without a view serves its
 * full picture for it.
 */
export type PhotoVariant = 'full' | 'view' | 'thumb';

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
	/** When it was taken, as its EXIF said; null when unknown. Shown and ordered by when known. */
	takenAt: string | null;
	createdAt: number;
	/** Whether this photo is the contact's current avatar, as it is or through its framing. */
	isAvatar: boolean;
	/** The square last chosen to wear this photo as the avatar, if any (see `./framing`). */
	framing: CropRect | null;
	/** When the household pinned it as a favourite (epoch ms); null when it is not one. */
	pinnedAt: number | null;
	/**
	 * The group photo this one was cut from, once a profile picture of its own
	 * (docs/02 §2.14); null when it was not, or the viewer cannot see it.
	 */
	cutFrom: { photoId: string; circleId: string; circleName: string } | null;
}

/** The file paths a deleted photo leaves behind, so the bytes can go too. */
export interface DeletedPhotoFiles {
	filePath: string;
	thumbPath: string;
}

/**
 * The photo record's writes (docs/08 §8.3). What a screen reads of photos are read models of
 * their own: `PhotoFileReads` below, `GalleryPhotoReads` (`./gallery`) and `JournalPhotoReads`
 * (`./journal-photos`).
 */
export interface PhotoRepository {
	insert(photo: StoredPhoto): Promise<void>;
	/** Whether a photo with this id is already stored (imports use stable ids). */
	exists(id: string): Promise<boolean>;
	setContactAvatar(contactId: string, photoId: string): Promise<void>;
	/**
	 * Pin a gallery photo as a favourite at `pinnedAt`, or unpin it with null. Unscoped: the
	 * use-case has already found the photo visible to whoever asked (`./gallery`).
	 */
	setGalleryPhotoPin(photoId: string, pinnedAt: number | null): Promise<void>;
	/** Change the caption and/or visibility of a photo the author uploaded; false if not theirs. */
	updateOwnGalleryPhoto(input: {
		authorId: string;
		photoId: string;
		caption?: string | null;
		visibility?: 'shared' | 'private';
	}): Promise<boolean>;
	/** The gallery photo, when the remover may remove it (`authoredRemovableBy`); else null. */
	findRemovableGalleryPhoto(remover: Remover, photoId: string): Promise<RemovableRecord | null>;
	/**
	 * Remove a gallery photo the remover may — checked again here, at the moment of removal —
	 * with its framing, and return their files; null when it was not theirs to remove. Clearing
	 * the avatar that pointed at either, and writing `audit` if there is one, happen in the same
	 * transaction, so a deleted photo can never leave a contact wearing a face that no longer
	 * exists.
	 */
	deleteRemovableGalleryPhoto(
		remover: Remover,
		photoId: string,
		audit: ActivityOf<'record.removed'> | null
	): Promise<DeletedPhotoFiles[] | null>;
}

/** Which stored file `/media/[id]` serves (docs/04 §4.6): a read model of its own. */
export interface PhotoFileReads {
	/** A photo's file in one of its sizes, only if the viewer may see it (docs/03 §3.7). */
	getVisiblePhotoFile(
		viewer: Viewer,
		photoId: string,
		variant: PhotoVariant
	): Promise<PhotoFile | null>;
}

/** Byte storage under the media volume; paths returned are what the DB records. */
export interface MediaStore {
	put(key: string, bytes: Uint8Array): Promise<string>;
	read(path: string): Promise<Uint8Array | null>;
	delete(path: string): Promise<void>;
}

/** Media served whole to the browser, streamed rather than read into memory first. */
export interface MediaStreamSource {
	/** The file as a body to stream from, or null when it is gone. */
	open(path: string): Promise<{ body: Blob; size: number } | null>;
}

export interface AvatarDeps {
	photos: Pick<PhotoRepository, 'insert' | 'setContactAvatar'>;
	media: Pick<MediaStore, 'put'>;
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
	const takenAt = storedTakenAt(upload.takenAt, deps.clock.now(), (m) => new InvalidAvatarError(m));
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
		takenAt,
		createdAt: deps.clock.now()
	});
	await deps.photos.setContactAvatar(contactId, id);
	return id;
}
