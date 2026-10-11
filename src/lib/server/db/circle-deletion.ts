import { and, countDistinct, eq, inArray, or } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { circleDeletableBy, membershipVisibleTo } from '../access/query-scoping';
import { canViewCircle, type Remover } from '../access/visibility';
import { activityEntry, type ActivityOf } from '../domain/activity/activity';
import type { CircleDeletionFacts, DeletedCirclePhotoFiles } from '../domain/circles/delete-circle';
import { cutsOf, turnCutsOfGroupPhotos } from './cut-turning';
import type * as schema from './schema';
import { activityLog, circle, circleMembership, contact, photo } from './schema';

/*
 * Deleting a circle (docs/02 §2.4.2, docs/03 `circle`), the half of `CircleRepository` that
 * reads what goes and takes it. Both are scoped by `circleDeletableBy`; past that check they
 * see the whole circle, because the deletion takes the photos and memberships the remover
 * cannot see as well.
 */

type Db = BunSQLiteDatabase<typeof schema>;

const photoIdsOf = (tx: Db, circleId: string): string[] =>
	tx
		.select({ id: photo.id })
		.from(photo)
		.where(eq(photo.circleId, circleId))
		.all()
		.map((row) => row.id);

/** What deleting `circleId` would take, or null when `remover` may not delete it. */
export function readCircleDeletion(
	db: Db,
	remover: Remover,
	circleId: string
): CircleDeletionFacts | null {
	const found = db
		.select({ name: circle.name })
		.from(circle)
		.where(and(eq(circle.id, circleId), circleDeletableBy(remover)))
		.get();
	if (!found) return null;

	// A person may be in it for several periods; they leave it once.
	const members =
		db
			.select({ count: countDistinct(circleMembership.contactId) })
			.from(circleMembership)
			.innerJoin(circle, eq(circle.id, circleMembership.circleId))
			.innerJoin(contact, eq(contact.id, circleMembership.contactId))
			.where(
				and(eq(circleMembership.circleId, circleId), membershipVisibleTo(remover, circle, contact))
			)
			.get()?.count ?? 0;

	const photoIds = photoIdsOf(db, circleId);
	const children = db
		.select({
			id: circle.id,
			name: circle.name,
			householdId: circle.householdId,
			ownerId: circle.createdBy,
			visibility: circle.visibility
		})
		.from(circle)
		.where(eq(circle.parentCircleId, circleId))
		.all()
		.map((child) => ({ id: child.id, name: child.name, visible: canViewCircle(remover, child) }));

	return {
		name: found.name,
		visibleMembers: members,
		photoIds,
		cuts: cutsOf(db, photoIds),
		children
	};
}

/**
 * Delete `circleId` in one transaction, if `remover` may: the rule is the `DELETE`'s own
 * condition. The circle row goes first only because that is where the rule sits; the photos
 * carry no foreign key to it (docs/03 `photo`), so the cuts are still turned before any photo
 * goes. Returns the photos' files, or null when nothing was deleted.
 */
export function deleteDeletableCircle(
	db: Db,
	remover: Remover,
	circleId: string,
	audit: ActivityOf<'circle.deleted'>
): DeletedCirclePhotoFiles[] | null {
	return db.transaction((tx) => {
		// Memberships cascade; nested circles keep everything and lose their parent (SET NULL).
		const deleted = tx
			.delete(circle)
			.where(and(eq(circle.id, circleId), circleDeletableBy(remover)))
			.returning({ id: circle.id })
			.all();
		if (deleted.length === 0) return null;

		const photoIds = photoIdsOf(tx, circleId);
		// Nobody's face goes with the circle: every cut becomes its wearer's own photo first.
		turnCutsOfGroupPhotos(tx, photoIds, 'groupPhotoRemoved');
		const files = tx
			.delete(photo)
			.where(
				or(
					eq(photo.circleId, circleId),
					// A framing left after the turning would point at a photo that is gone.
					photoIds.length > 0 ? inArray(photo.framingOf, photoIds) : undefined
				)
			)
			.returning({ filePath: photo.filePath, thumbPath: photo.thumbPath, viewPath: photo.viewPath })
			.all();

		// Same transaction as the delete: a removal with no trace is what the log prevents.
		tx.insert(activityLog).values(activityEntry(audit)).run();
		return files;
	});
}
