import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import {
	cutLeftBehind,
	cutsToTurn,
	ownPhotoFromCut,
	type Cut,
	type CutTurnReason
} from '../domain/media/cuts';
import type * as schema from './schema';
import { contact, photo } from './schema';

/*
 * Turning profile pictures cut from a group photo into photos of their own
 * (docs/concepts/circle-photos.md §5.2, §5.4). Every write that takes a cut off a person — a
 * new picture, the group photo removed or made private, a merge — calls these inside its own
 * transaction, so there is never a moment in which someone's face is gone. The decisions are
 * the domain's (`domain/media/cuts.ts`); this only reads the rows they need and writes the
 * outcome. Nothing is re-encoded: the framing row itself becomes the gallery photo.
 */

/** A transaction, or the database itself: both read and write the same way. */
type Db = BunSQLiteDatabase<typeof schema>;

/** The photo a framing is of; a framing whose photo has a circle is a cut. */
const framed = alias(photo, 'framed');

/** Every cut of these group photos. */
export function cutsOf(tx: Db, groupPhotoIds: readonly string[]): Cut[] {
	if (groupPhotoIds.length === 0) return [];
	return tx
		.select({ id: photo.id, contactId: photo.contactId, groupPhotoId: photo.framingOf })
		.from(photo)
		.where(inArray(photo.framingOf, [...groupPhotoIds]))
		.all()
		.flatMap((row) =>
			row.contactId !== null && row.groupPhotoId !== null
				? [{ id: row.id, contactId: row.contactId, groupPhotoId: row.groupPhotoId }]
				: []
		);
}

/** Make each of these cuts a gallery photo of its person, read as `reason` says. */
function turnCuts(tx: Db, cutIds: readonly string[], reason: CutTurnReason): void {
	if (cutIds.length === 0) return;
	const rows = tx
		.select({
			id: photo.id,
			visibility: photo.visibility,
			groupId: framed.id,
			groupCreatedAt: framed.createdAt,
			groupTakenAt: framed.takenAt
		})
		.from(photo)
		.innerJoin(framed, eq(framed.id, photo.framingOf))
		.where(and(inArray(photo.id, [...cutIds]), isNotNull(framed.circleId)))
		.all();
	for (const row of rows) {
		const own = ownPhotoFromCut(
			row,
			{ id: row.groupId, createdAt: row.groupCreatedAt, takenAt: row.groupTakenAt },
			reason
		);
		tx.update(photo)
			.set({
				...own,
				framingOf: null,
				// A gallery photo carries no square of its own; a new framing of it will.
				cropX: null,
				cropY: null,
				cropSize: null
			})
			.where(eq(photo.id, row.id))
			.run();
	}
}

/**
 * Before these group photos are removed (or made private): turn every cut of them into its
 * person's own photo, still worn. Returns how many people that concerned.
 */
export function turnCutsOfGroupPhotos(tx: Db, groupPhotoIds: readonly string[], reason: CutTurnReason): number {
	const turning = cutsToTurn(cutsOf(tx, groupPhotoIds), groupPhotoIds);
	turnCuts(tx, turning.cutIds, reason);
	if (reason === 'groupPhotoRemoved') {
		// Photos earlier cuts became still name the group photo; it is about to be gone.
		tx.update(photo).set({ cutFrom: null }).where(inArray(photo.cutFrom, [...groupPhotoIds])).run();
	}
	return turning.people;
}

/**
 * Before `contactId` puts on another picture: the cut they wore, if any, becomes their own
 * photo — unless the next picture is a new cut of the same group photo, which replaces it.
 */
export function keepCutLeftBehind(tx: Db, contactId: string, next: { framingOf: string | null }): void {
	const worn = tx
		.select({ id: photo.id, framingOf: photo.framingOf, circleId: framed.circleId })
		.from(contact)
		.innerJoin(photo, eq(photo.id, contact.avatarPhotoId))
		.leftJoin(framed, eq(framed.id, photo.framingOf))
		.where(eq(contact.id, contactId))
		.get();
	const left = cutLeftBehind(
		worn ? { id: worn.id, framingOf: worn.framingOf, isCut: worn.circleId !== null } : null,
		next
	);
	if (left) turnCuts(tx, [left], 'switched');
}

/**
 * Every cut `contactId` has but does not wear becomes their own photo — or every cut at all with
 * `evenWorn`, for a record about to be merged away, whose worn cut may clash with the survivor's.
 */
export function keepUnwornCuts(tx: Db, contactId: string, options: { evenWorn?: boolean } = {}): void {
	const wearing = options.evenWorn
		? undefined
		: tx.select({ id: contact.avatarPhotoId }).from(contact).where(eq(contact.id, contactId)).get();
	const unworn = tx
		.select({ id: photo.id })
		.from(photo)
		.innerJoin(framed, eq(framed.id, photo.framingOf))
		.where(and(eq(photo.contactId, contactId), isNotNull(framed.circleId)))
		.all()
		.map((row) => row.id)
		.filter((id) => id !== wearing?.id);
	turnCuts(tx, unworn, 'switched');
}
