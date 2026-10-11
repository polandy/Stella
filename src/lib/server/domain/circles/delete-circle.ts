import type { Remover } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import { activityRecord } from '../activity/activity';
import type { DeletedPhotoFiles, MediaStore } from '../media/avatars';
import { cutsToTurn, type Cut } from '../media/cuts';
import { CircleGoneError } from './circle-details';
import type { CircleRepository } from './circles';

/*
 * Deleting a circle (docs/02 §2.4.2): its creator always, an admin when it is shared — the
 * authored-record rule with the circle as the record (`canDeleteCircle`, docs/03 §3.7). It takes
 * everything in the circle, what the remover cannot see included: every photo, the memberships
 * of people private to someone else. Profile pictures cut from its photos become their wearer's
 * own, and the circles nested in it stay, without a parent. Confirmed, logged, never undone: the
 * files are unlinked once the write has committed.
 */

/** What deleting a circle would take, as the repository reads it for one remover. */
export interface CircleDeletionFacts {
	name: string;
	/** Only the members the remover sees: the others are not theirs to know about. */
	visibleMembers: number;
	/** Every photo of the circle, whoever sees it: all of them go. */
	photoIds: string[];
	/** Every cut of those photos, whoever wears it. */
	cuts: Cut[];
	/** The circles nested in it; `visible` when the remover sees that one. */
	children: { id: string; name: string; visible: boolean }[];
}

/** What the confirm step says goes and what stays. */
export interface CircleDeletionPreview {
	name: string;
	members: number;
	photos: number;
	/** How many of its photos someone wears a picture cut from. */
	wornPhotos: number;
	/** How many people wear one: they keep it as a photo of their own. */
	wearers: number;
	/** The children that stay: named when the remover sees them, else only counted. */
	children: { named: { id: string; name: string }[]; unnamed: number };
}

/** A deleted circle photo's files; the 1600 px view exists only for a large original. */
export interface DeletedCirclePhotoFiles extends DeletedPhotoFiles {
	viewPath: string | null;
}

export interface CircleDeletionPreviewDeps {
	circles: Pick<CircleRepository, 'readDeletion'>;
}

export interface DeleteCircleDeps {
	circles: Pick<CircleRepository, 'getVisibleTo' | 'deleteDeletable'>;
	media: Pick<MediaStore, 'delete'>;
	ids: IdGenerator;
	clock: Clock;
}

/**
 * What deleting `circleId` would take, for the confirm step. A circle the remover may not delete
 * — not theirs, not visible, or gone — answers `CircleGoneError`.
 */
export async function circleDeletionPreview(
	deps: CircleDeletionPreviewDeps,
	remover: Remover,
	circleId: string
): Promise<CircleDeletionPreview> {
	const facts = await deps.circles.readDeletion(remover, circleId);
	if (facts === null) throw new CircleGoneError();
	const turning = cutsToTurn(facts.cuts, facts.photoIds);
	const going = new Set(facts.photoIds);
	return {
		name: facts.name,
		members: facts.visibleMembers,
		photos: facts.photoIds.length,
		wornPhotos: new Set(
			facts.cuts.filter((cut) => going.has(cut.groupPhotoId)).map((cut) => cut.groupPhotoId)
		).size,
		wearers: turning.people,
		children: {
			named: facts.children
				.filter((child) => child.visible)
				.map(({ id, name }) => ({ id, name }))
				.sort((a, b) => a.name.localeCompare(b.name)),
			unnamed: facts.children.filter((child) => !child.visible).length
		}
	};
}

/**
 * Delete `circleId` with everything in it, in one transaction with its log row, then unlink the
 * photos' files — a file left behind is the harmless direction of that failure, a deletion with
 * no trace is not. A circle the remover may not delete, cannot see, or that is gone answers
 * `CircleGoneError`, which the edge reads as done (docs/02 §2.23).
 */
export async function deleteCircle(
	deps: DeleteCircleDeps,
	remover: Remover,
	circleId: string
): Promise<void> {
	const circle = await deps.circles.getVisibleTo(remover, circleId);
	if (circle === null) throw new CircleGoneError();

	const files = await deps.circles.deleteDeletable(
		remover,
		circleId,
		activityRecord(deps, remover, {
			kind: 'circle.deleted',
			circleId,
			name: circle.name,
			visibility: circle.visibility
		})
	);
	if (files === null) throw new CircleGoneError();

	for (const file of files) {
		await deps.media.delete(file.filePath);
		await deps.media.delete(file.thumbPath);
		if (file.viewPath) await deps.media.delete(file.viewPath);
	}
}
