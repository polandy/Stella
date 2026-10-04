import type { CropRect } from '../../../image/crop';
import { phrase } from '../../../i18n/phrase';
import type { Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import {
	InvalidAvatarError,
	validateAvatarUpload,
	type AvatarUpload,
	type DeletedPhotoFiles,
	type GalleryPhoto,
	type ImageMime,
	type MediaStore,
	type StoredPhoto
} from './avatars';

/*
 * Wearing a gallery photo as the avatar through a chosen square (docs/02 §2.14). The photo stays
 * one photo in the gallery; the square is remembered on a *framing* of it — its own row and id,
 * rendered once in the browser like any avatar. Its own id is what lets media stay cached as
 * immutable: choosing a new square makes a new framing with a new address, never new bytes
 * behind an old one. Each photo has at most one framing, so choosing again starts where the
 * last choice left off and replaces it.
 */

const EXT: Record<ImageMime, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp'
};

/** A framing as stored: a photo row that belongs to another photo and carries its square. */
// A framing carries no capture date: it is never listed, and a cut that becomes a photo of its
// own takes its group photo's (`./cuts`).
export interface StoredFraming extends Omit<StoredPhoto, 'takenAt'> {
	framingOf: string;
	crop: CropRect;
}

/** What framing needs from storage; the Drizzle photo adapter implements it beside `PhotoRepository`. */
export interface FramingRepository {
	/** One gallery photo, only if it belongs to that contact and the viewer may see it. */
	findVisibleGalleryPhoto(viewer: Viewer, contactId: string, photoId: string): Promise<GalleryPhoto | null>;
	/**
	 * In one transaction: drop the photo's previous framing, store this one and make it the
	 * contact's avatar. Returns the files of the framing it replaced, so the bytes can go too.
	 */
	replaceFraming(framing: StoredFraming): Promise<DeletedPhotoFiles[]>;
}

/** Ports for `frameAsAvatar` (docs/08 §8.3). */
export interface FramingDeps {
	framings: FramingRepository;
	media: MediaStore;
	ids: IdGenerator;
	clock: Clock;
}

/** One request to wear a gallery photo through a chosen square. */
export interface FrameAsAvatarInput {
	contactId: string;
	photoId: string;
	/** The square, in the full-size picture's pixels. */
	crop: CropRect;
	/** The square rendered by the browser, as for any avatar. */
	upload: AvatarUpload;
}

/** A square that is a real square and lies inside the picture (when its size is on record). */
export function assertCropInside(crop: CropRect, picture: { width: number | null; height: number | null }): void {
	const numbers = [crop.x, crop.y, crop.size];
	const inside =
		numbers.every(Number.isFinite) &&
		crop.x >= 0 &&
		crop.y >= 0 &&
		crop.size > 0 &&
		(picture.width === null || crop.x + crop.size <= picture.width) &&
		(picture.height === null || crop.y + crop.size <= picture.height);
	if (!inside) throw new InvalidAvatarError(phrase('errors.image.cropOutside'));
}

/**
 * Frame one of the contact's gallery photos and wear the framing. False when the viewer cannot
 * see that photo on that contact — so a guessed id can neither borrow someone else's face nor
 * confirm that a private photo exists. Throws InvalidAvatarError for a bad square or bytes.
 */
export async function frameAsAvatar(deps: FramingDeps, viewer: Viewer, input: FrameAsAvatarInput): Promise<boolean> {
	const source = await deps.framings.findVisibleGalleryPhoto(viewer, input.contactId, input.photoId);
	if (!source) return false;
	assertCropInside(input.crop, source);
	const mime = validateAvatarUpload(input.upload);

	const id = deps.ids.next();
	const ext = EXT[mime];
	const filePath = await deps.media.put(`${id}.${ext}`, input.upload.image);
	const thumbPath = await deps.media.put(`${id}_thumb.${ext}`, input.upload.thumb);

	const replaced = await deps.framings.replaceFraming({
		id,
		householdId: viewer.householdId,
		contactId: input.contactId,
		journalEntryId: null,
		framingOf: source.id,
		crop: input.crop,
		// A framing is seen by exactly who sees its photo, whoever chose the square.
		createdBy: source.createdBy,
		visibility: source.visibility,
		filePath,
		thumbPath,
		mime,
		width: input.upload.width,
		height: input.upload.height,
		sizeBytes: input.upload.image.byteLength,
		createdAt: deps.clock.now()
	});
	for (const files of replaced) {
		await deps.media.delete(files.filePath);
		await deps.media.delete(files.thumbPath);
	}
	return true;
}
