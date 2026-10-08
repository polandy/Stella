import type { CropRect } from '../../../media/crop';
import type { Viewer, Visibility } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { ContactLookup } from '../contacts/contacts';
import type { IdGenerator } from '../../id';
import {
	validateAvatarUpload,
	type AvatarUpload,
	type DeletedPhotoFiles,
	type ImageMime,
	type MediaStore
} from './avatars';
import { assertCropInside, type StoredFraming } from './framing';

/*
 * Profile pictures cut from a group photo (docs/02 §2.14). A class photo
 * already holds everybody's face, so a person's profile picture can be a square of it: a
 * *framing* of the circle photo (docs/03 §photo) that belongs to that person, one per person and
 * photo, rendered once at 1024 px so it can later stand on its own. Nothing is copied into the
 * person's gallery and the group photo stays one photo.
 *
 * A cut never just disappears. When the person changes their picture, the cut they wore becomes
 * a photo of their own; when its group photo is removed or made private, every cut of it does,
 * still worn. The rules for which cuts turn, and how such a photo reads, are pure and below;
 * the turning itself is the repository's, in the same transaction as what caused it.
 */

/** A framing of a circle photo that one person wears. */
export interface Cut {
	id: string;
	contactId: string;
	groupPhotoId: string;
}

/** What taking group photos away means for the profile pictures cut from them. */
export interface CutsToTurn {
	/** Every cut of those photos, each to become its person's own photo first. */
	cutIds: string[];
	/** How many people wear one: the number the warning names. */
	people: number;
}

/**
 * The cuts removing (or making private) `groupPhotoIds` must turn into photos of their own —
 * one photo, or all of a circle's at once with one combined question (concept §5.4).
 */
export function cutsToTurn(cuts: readonly Cut[], groupPhotoIds: readonly string[]): CutsToTurn {
	const going = new Set(groupPhotoIds);
	const turned = cuts.filter((cut) => going.has(cut.groupPhotoId));
	return {
		cutIds: turned.map((cut) => cut.id),
		people: new Set(turned.map((cut) => cut.contactId)).size
	};
}

/** The picture a person wears now, as far as cuts are concerned. */
export interface WornPicture {
	id: string;
	/** The photo it is a framing of; null for an uploaded picture. */
	framingOf: string | null;
	/** Whether that photo is a circle's — the framing is then a cut. */
	isCut: boolean;
}

/**
 * The cut a person stops wearing when their picture changes to `next`, which must then become
 * a photo of their own (concept §5.2) — or null. Cutting the same group photo again for them
 * replaces their cut rather than keeping the old square beside it.
 */
export function cutLeftBehind(
	worn: WornPicture | null,
	next: { framingOf: string | null }
): string | null {
	if (!worn?.isCut) return null;
	return next.framingOf === worn.framingOf ? null : worn.id;
}

/** Why a cut becomes a photo of its own. */
export type CutTurnReason = 'switched' | 'groupPhotoRemoved' | 'groupPhotoPrivate';

/** How a cut reads once it is a photo in its person's gallery. */
export interface OwnPhotoFromCut {
	/** The group photo it remembers; null once that photo is gone. */
	cutFrom: string | null;
	createdAt: number;
	takenAt: string | null;
	visibility: Visibility;
}

/**
 * A cut as a photo of its own: dated like its group photo, so it sits in the gallery where that
 * moment was. It remembers the group photo while there is one. A group photo turning private
 * leaves its cuts shared, so nobody's face disappears from the household with it (§5.4).
 */
export function ownPhotoFromCut(
	cut: { visibility: Visibility },
	group: { id: string; createdAt: number; takenAt: string | null },
	reason: CutTurnReason
): OwnPhotoFromCut {
	return {
		cutFrom: reason === 'groupPhotoRemoved' ? null : group.id,
		createdAt: group.createdAt,
		takenAt: group.takenAt,
		visibility: reason === 'groupPhotoPrivate' ? 'shared' : cut.visibility
	};
}

// ── Ports ─────────────────────────────────────────────────────────────────

/** A circle photo as a cut is made from it. */
export interface GroupPhoto {
	id: string;
	circleId: string;
	createdBy: string;
	visibility: Visibility;
	width: number | null;
	height: number | null;
}

/** One cut of a circle's photo as the circle page shows it; the person only when the viewer sees them. */
export interface CircleCutRow {
	groupPhotoId: string;
	/** Null when the viewer cannot see who wears it: counted, never named. */
	contactId: string | null;
	crop: CropRect | null;
}

/** A group photo a person was cut from, for the *On group photos* row (concept §5.2). */
export interface GroupPhotoOfPerson {
	id: string;
	circleId: string;
	circleName: string;
	/** When it was taken, as its EXIF said; null when unknown. Shown and ordered by when known. */
	takenAt: string | null;
	createdAt: number;
}

/** A group photo that can be cut for a person, from the circles they belong to. */
export interface GroupPhotoToCut extends GroupPhotoOfPerson {
	width: number | null;
	height: number | null;
	/** The square this person wears of it now, so choosing again starts there. */
	crop: CropRect | null;
}

export interface CutRepository {
	/** One circle photo, by id alone, only if the viewer may see it. */
	findVisibleGroupPhoto(viewer: Viewer, photoId: string): Promise<GroupPhoto | null>;
	/**
	 * In one transaction: drop this person's earlier cut of the same photo, keep the cut they
	 * wore before (of another photo) as their own photo, store this one and wear it. Returns the
	 * files of the cut it replaced, so the bytes can go too.
	 */
	replaceCut(cut: StoredFraming): Promise<DeletedPhotoFiles[]>;
	/** Every cut of the circle's photos the viewer may see. */
	listCutsOfCircle(viewer: Viewer, circleId: string): Promise<CircleCutRow[]>;
	/** The visible group photos `contactId` was ever cut from, newest first. */
	listGroupPhotosOf(viewer: Viewer, contactId: string): Promise<GroupPhotoOfPerson[]>;
	/** The visible photos of the visible circles `contactId` belongs to, newest first. */
	listGroupPhotosToCut(viewer: Viewer, contactId: string): Promise<GroupPhotoToCut[]>;
}

/** Ports for cutting a profile picture (docs/08 §8.3). */
export interface CutDeps {
	cuts: CutRepository;
	contacts: ContactLookup;
	media: Pick<MediaStore, 'put' | 'delete'>;
	ids: IdGenerator;
	clock: Clock;
}

/** One request to cut a person's profile picture out of a group photo. */
export interface CutProfilePictureInput {
	photoId: string;
	contactId: string;
	/** The square, in the full picture's pixels. */
	crop: CropRect;
	/** The square rendered by the browser at 1024 px. */
	upload: AvatarUpload;
}

const EXT: Record<ImageMime, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp'
};

// ── Use-cases ─────────────────────────────────────────────────────────────

/**
 * Cut `contactId`'s profile picture out of a circle photo and make them wear it. Anyone who can
 * see both the photo and the person may. False when either is not visible to them — the same
 * answer whether or not it exists. Throws InvalidAvatarError for a bad square or bytes.
 */
export async function cutProfilePicture(
	deps: CutDeps,
	viewer: Viewer,
	input: CutProfilePictureInput
): Promise<boolean> {
	const [group, person] = await Promise.all([
		deps.cuts.findVisibleGroupPhoto(viewer, input.photoId),
		deps.contacts.findByIdVisibleTo(viewer, input.contactId)
	]);
	if (!group || !person) return false;
	assertCropInside(input.crop, group);
	const mime = validateAvatarUpload(input.upload);

	const id = deps.ids.next();
	const ext = EXT[mime];
	const filePath = await deps.media.put(`${id}.${ext}`, input.upload.image);
	const thumbPath = await deps.media.put(`${id}_thumb.${ext}`, input.upload.thumb);

	const replaced = await deps.cuts.replaceCut({
		id,
		householdId: viewer.householdId,
		contactId: input.contactId,
		journalEntryId: null,
		framingOf: group.id,
		crop: input.crop,
		// A cut is seen by whoever sees its group photo's framings, as any framing (docs/03 §photo).
		createdBy: group.createdBy,
		visibility: group.visibility,
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

/** Who wears a cut of one of the circle's photos, as the circle page shows it. */
export interface PhotoCuts {
	/** How many people wear a cut of it, including any the viewer cannot see. */
	people: number;
	/** The ones the viewer can see, with their square. */
	wearers: { contactId: string; crop: CropRect | null }[];
}

/** The cuts of each of the circle's photos, by photo id; a photo nobody wears is left out. */
export async function listCircleCuts(
	deps: Pick<CutDeps, 'cuts'>,
	viewer: Viewer,
	circleId: string
): Promise<Record<string, PhotoCuts>> {
	const byPhoto: Record<string, PhotoCuts> = {};
	for (const row of await deps.cuts.listCutsOfCircle(viewer, circleId)) {
		const entry = (byPhoto[row.groupPhotoId] ??= { people: 0, wearers: [] });
		entry.people += 1;
		if (row.contactId !== null) entry.wearers.push({ contactId: row.contactId, crop: row.crop });
	}
	return byPhoto;
}

/** The group photos a person was cut from, for the *On group photos* row. */
export async function listGroupPhotosOf(
	deps: Pick<CutDeps, 'cuts'>,
	viewer: Viewer,
	contactId: string
): Promise<GroupPhotoOfPerson[]> {
	return deps.cuts.listGroupPhotosOf(viewer, contactId);
}

/** The group photos a person's picture can be cut from: their circles' photos the viewer sees. */
export async function listGroupPhotosToCut(
	deps: Pick<CutDeps, 'cuts'>,
	viewer: Viewer,
	contactId: string
): Promise<GroupPhotoToCut[]> {
	return deps.cuts.listGroupPhotosToCut(viewer, contactId);
}
