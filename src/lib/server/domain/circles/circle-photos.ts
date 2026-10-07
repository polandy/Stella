import { TranslatableError } from '../../../errors/translatable';
import { phrase } from '../../../i18n/phrase';
import type { Viewer, Visibility } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import type { DeletedPhotoFiles, ImageMime, MediaStore } from '../media/avatars';
import { CAPTION_MAX_LENGTH, CaptionTooLongError } from '../media/gallery';
import {
	InvalidImageError,
	JOURNAL_IMAGE_MAX_BYTES,
	validateImageUpload,
	validateTakenAt,
	type ImageUpload
} from '../media/journal-photos';
import { sniffImageMime } from '../media/avatars';
import { leadPhoto, matchRoleOption, photoRoleOptions } from './circle-photo-view';
import { suggestRoles, type CircleRepository } from './circles';

/*
 * The photos of a circle (docs/02 §2.4.2). A circle photo is a
 * photo like a person's (docs/02 §2.14) — processed in the browser, shared or private, captioned,
 * pinned — that belongs to one circle and to nobody's gallery, and may carry one of the
 * circle's roles.
 *
 * Who may do what differs from the person gallery on purpose (concept §4): the caption, the
 * role and the pin describe the household's view of the circle, so anyone who can see the
 * photo may change them; shared/private and removing stay with whoever added it. Reading is
 * scoped by the repository through the access layer (docs/03 §3.7).
 */

/** A circle photo, resolved for the page. */
export interface CirclePhoto {
	id: string;
	circleId: string;
	/** The role as stored; null = the circle as a whole. */
	role: string | null;
	caption: string | null;
	visibility: Visibility;
	createdBy: string;
	/** Who added it, by name — the lightbox says so. */
	createdByName: string;
	width: number | null;
	height: number | null;
	/** When it was taken, as its EXIF said (`../../../image/taken-at`); null when unknown. */
	takenAt: string | null;
	createdAt: number;
	/** When the household pinned it as a favourite (epoch ms); null when it is not one. */
	pinnedAt: number | null;
}

/** A circle photo as it is written. */
export interface StoredCirclePhoto {
	id: string;
	householdId: string;
	circleId: string;
	circleRole: string | null;
	createdBy: string;
	visibility: Visibility;
	filePath: string;
	thumbPath: string;
	/** The 1600 px view beside a larger full picture; null when the full picture is that small. */
	viewPath: string | null;
	mime: ImageMime;
	width: number;
	height: number;
	sizeBytes: number;
	takenAt: string | null;
	createdAt: number;
}

/** What anyone who sees a photo may change about it. */
export interface CirclePhotoDescription {
	caption?: string | null;
	role?: string | null;
	pinnedAt?: number | null;
}

export interface CirclePhotoRepository {
	insert(photo: StoredCirclePhoto): Promise<void>;
	/** The circle's photos the viewer may see, in no particular order. */
	listVisible(viewer: Viewer, circleId: string): Promise<CirclePhoto[]>;
	/** One photo, only if it belongs to that circle and the viewer may see it. */
	findVisible(viewer: Viewer, circleId: string, photoId: string): Promise<CirclePhoto | null>;
	/** Unscoped: the use-case has already found the photo visible to whoever asked. */
	describe(photoId: string, changes: CirclePhotoDescription): Promise<void>;
	/** Re-scope a photo of that circle the author added; false when it is not theirs. */
	setOwnVisibility(input: {
		authorId: string;
		circleId: string;
		photoId: string;
		visibility: Visibility;
	}): Promise<boolean>;
	/**
	 * Remove a photo of that circle the author added and return its files; null when not theirs.
	 * Profile pictures cut from it become their people's own photos first, in the same
	 * transaction (concept §5.4) — as they do when it is made private (`setOwnVisibility`).
	 */
	deleteOwn(input: {
		authorId: string;
		circleId: string;
		photoId: string;
	}): Promise<(DeletedPhotoFiles & { viewPath: string | null }) | null>;
	/** Every photo the viewer may see in every circle they may see — what covers are chosen from. */
	listCoverCandidates(viewer: Viewer): Promise<CirclePhoto[]>;
}

export interface CirclePhotoDeps {
	circlePhotos: CirclePhotoRepository;
	circles: Pick<CircleRepository, 'getVisibleTo' | 'listMembersVisibleTo'>;
	media: MediaStore;
	ids: IdGenerator;
	clock: Clock;
}

/** The circle a photo is meant for is not one the uploader can see (any more). */
export class CircleGoneError extends TranslatableError {
	constructor() {
		super(phrase('errors.circle.notFound'), 'CircleGoneError');
	}
}

/** A photo's role is picked from the circle's roles, never typed (concept §2). */
export class UnknownPhotoRoleError extends TranslatableError {
	constructor() {
		super(phrase('errors.circlePhoto.unknownRole'), 'UnknownPhotoRoleError');
	}
}

const EXT: Record<ImageMime, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp'
};

/** The circle's roles as its members carry them, most common first (the members list's order). */
async function memberRoles(
	deps: Pick<CirclePhotoDeps, 'circles'>,
	viewer: Viewer,
	circleId: string
) {
	return suggestRoles(
		(await deps.circles.listMembersVisibleTo(viewer, circleId)).map((m) => m.role)
	);
}

/** The circle's photos the viewer may see; the page lays them out (`circle-photo-view.ts`). */
export async function listCirclePhotos(
	deps: Pick<CirclePhotoDeps, 'circlePhotos'>,
	viewer: Viewer,
	circleId: string
): Promise<CirclePhoto[]> {
	return deps.circlePhotos.listVisible(viewer, circleId);
}

/**
 * Check an upload before its photos follow (the `circleGallery.add` command): the circle must
 * be visible to the uploader and the role one the circle has. A role only photos still carry
 * counts too, so a phone that queued its photos before a re-role does not lose them.
 */
export async function prepareCirclePhotoUpload(
	deps: Pick<CirclePhotoDeps, 'circles' | 'circlePhotos'>,
	viewer: Viewer,
	input: { circleId: string; role: string | null; visibility: Visibility }
): Promise<{ circleId: string; role: string | null; visibility: Visibility }> {
	if (!(await deps.circles.getVisibleTo(viewer, input.circleId))) throw new CircleGoneError();
	const photoRoles = (await deps.circlePhotos.listVisible(viewer, input.circleId)).map(
		(p) => p.role
	);
	const options = suggestRoles([
		...(await memberRoles(deps, viewer, input.circleId)),
		...photoRoles
	]);
	const match = matchRoleOption(input.role, options);
	if (!match) throw new UnknownPhotoRoleError();
	return { circleId: input.circleId, role: match.role, visibility: input.visibility };
}

/**
 * The cap on a circle photo's full picture. It is kept up to 4096 px on its longest edge so
 * faces can be cut from it (concept §5.3) — a few megabytes as a JPEG, with room to spare for a
 * detailed one. Its view and thumbnail keep the gallery's caps.
 */
export const CIRCLE_IMAGE_MAX_BYTES = 20_000_000;

/** A circle photo as the browser sends it: the gallery's renditions, and a view beside a large one. */
export interface CirclePhotoUpload extends ImageUpload {
	/** The 1600 px view, sent when the full picture is larger than that; absent otherwise. */
	view?: Uint8Array;
}

/** Validate a circle photo upload and return its true (sniffed) mime; throws InvalidImageError. */
function validateCirclePhotoUpload(upload: CirclePhotoUpload): ImageMime {
	const mime = validateImageUpload(upload, CIRCLE_IMAGE_MAX_BYTES);
	if (upload.view === undefined) return mime;
	if (upload.view.byteLength === 0) throw new InvalidImageError(phrase('errors.image.empty'));
	if (upload.view.byteLength > JOURNAL_IMAGE_MAX_BYTES)
		throw new InvalidImageError(phrase('errors.image.tooLarge'));
	if (sniffImageMime(upload.view) !== mime)
		throw new InvalidImageError(phrase('errors.image.formatMismatch'));
	return mime;
}

/**
 * Validate and store one circle photo. The caller has already checked the circle and the role
 * (`prepareCirclePhotoUpload`). Uses the gallery's processing, with a larger full picture and a
 * 1600 px view beside it (concept §5.3).
 */
export async function addCirclePhoto(
	deps: Pick<CirclePhotoDeps, 'circlePhotos' | 'media' | 'ids' | 'clock'>,
	uploader: { userId: string; householdId: string },
	input: {
		circleId: string;
		role: string | null;
		visibility: Visibility;
		upload: CirclePhotoUpload;
	}
): Promise<string> {
	const mime = validateCirclePhotoUpload(input.upload);
	const takenAt = validateTakenAt(input.upload, deps.clock.now());
	const id = deps.ids.next();
	const ext = EXT[mime];

	const filePath = await deps.media.put(`${id}.${ext}`, input.upload.image);
	const viewPath = input.upload.view
		? await deps.media.put(`${id}_view.${ext}`, input.upload.view)
		: null;
	const thumbPath = await deps.media.put(`${id}_thumb.${ext}`, input.upload.thumb);

	await deps.circlePhotos.insert({
		id,
		householdId: uploader.householdId,
		circleId: input.circleId,
		circleRole: input.role,
		createdBy: uploader.userId,
		visibility: input.visibility,
		filePath,
		thumbPath,
		viewPath,
		mime,
		width: input.upload.width,
		height: input.upload.height,
		sizeBytes: input.upload.image.byteLength,
		takenAt,
		createdAt: deps.clock.now()
	});
	return id;
}

interface PhotoRef {
	circleId: string;
	photoId: string;
}

/** Caption a photo; blank clears it. Anyone who sees it may. False when they cannot see it. */
export async function captionCirclePhoto(
	deps: Pick<CirclePhotoDeps, 'circlePhotos'>,
	viewer: Viewer,
	input: PhotoRef & { caption: string }
): Promise<boolean> {
	const trimmed = input.caption.trim();
	if (trimmed.length > CAPTION_MAX_LENGTH) throw new CaptionTooLongError();
	const photo = await deps.circlePhotos.findVisible(viewer, input.circleId, input.photoId);
	if (!photo) return false;
	await deps.circlePhotos.describe(photo.id, { caption: trimmed === '' ? null : trimmed });
	return true;
}

/**
 * Give a photo one of the circle's roles, or none with a blank pick. The photo's own role stays
 * a choice after its members are gone (concept §4). Anyone who sees the photo may.
 */
export async function setCirclePhotoRole(
	deps: Pick<CirclePhotoDeps, 'circlePhotos' | 'circles'>,
	viewer: Viewer,
	input: PhotoRef & { role: string | null }
): Promise<boolean> {
	const photo = await deps.circlePhotos.findVisible(viewer, input.circleId, input.photoId);
	if (!photo) return false;
	const options = photoRoleOptions(await memberRoles(deps, viewer, input.circleId), photo.role);
	const match = matchRoleOption(input.role, options);
	if (!match) throw new UnknownPhotoRoleError();
	await deps.circlePhotos.describe(photo.id, { role: match.role });
	return true;
}

/**
 * Pin a photo as a favourite, or unpin it. A pin is the household's, as on a person's photos
 * (docs/02 §2.14); pinning one that is already pinned keeps its first pin.
 */
export async function pinCirclePhoto(
	deps: Pick<CirclePhotoDeps, 'circlePhotos' | 'clock'>,
	viewer: Viewer,
	input: PhotoRef & { pinned: boolean }
): Promise<boolean> {
	const photo = await deps.circlePhotos.findVisible(viewer, input.circleId, input.photoId);
	if (!photo) return false;
	if (input.pinned === (photo.pinnedAt !== null)) return true;
	await deps.circlePhotos.describe(photo.id, { pinnedAt: input.pinned ? deps.clock.now() : null });
	return true;
}

/** Move a photo between shared and private. Only whoever added it may. */
export async function setCirclePhotoVisibility(
	deps: Pick<CirclePhotoDeps, 'circlePhotos'>,
	viewer: Viewer,
	input: PhotoRef & { visibility: Visibility }
): Promise<boolean> {
	return deps.circlePhotos.setOwnVisibility({ authorId: viewer.id, ...input });
}

/**
 * Remove a photo and its files. Only whoever added it may. The row goes first: if removing the
 * bytes fails, the photo is already gone from every view, the harmless direction of that failure.
 */
export async function removeCirclePhoto(
	deps: Pick<CirclePhotoDeps, 'circlePhotos' | 'media'>,
	viewer: Viewer,
	input: PhotoRef
): Promise<boolean> {
	const removed = await deps.circlePhotos.deleteOwn({ authorId: viewer.id, ...input });
	if (!removed) return false;
	await deps.media.delete(removed.filePath);
	await deps.media.delete(removed.thumbPath);
	if (removed.viewPath) await deps.media.delete(removed.viewPath);
	return true;
}

/**
 * Each visible circle's cover photo id (concept §3.1): the lead of its photos without a role.
 * A circle without one is left out. A parent circle never borrows a child's cover (§4).
 */
export async function listCircleCovers(
	deps: Pick<CirclePhotoDeps, 'circlePhotos'>,
	viewer: Viewer
): Promise<Record<string, string>> {
	const byCircle = new Map<string, CirclePhoto[]>();
	for (const photo of await deps.circlePhotos.listCoverCandidates(viewer)) {
		byCircle.set(photo.circleId, [...(byCircle.get(photo.circleId) ?? []), photo]);
	}
	const covers: Record<string, string> = {};
	for (const [circleId, photos] of byCircle) {
		const cover = leadPhoto(photos, null);
		if (cover) covers[circleId] = cover.id;
	}
	return covers;
}
