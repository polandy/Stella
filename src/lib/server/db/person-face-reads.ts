import { and, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { alias } from 'drizzle-orm/sqlite-core';
import { childRecordVisibleTo, circlePhotoColumnsVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { PersonFace, PersonFaceReads } from '../domain/circles/period-faces';
import { photoDatedAt } from './photo-dated-at';
import type * as schema from './schema';
import { circle, contact, photo } from './schema';

// A person's square pictures, framings and cuts, dated by their source, scoped by §3.7 (§2.4.2).
/** The photo a framing or cut was taken from. */
const source = alias(photo, 'face_source');
const sourceCircle = alias(circle, 'face_source_circle');
/** The group photo a former cut remembers, and its circle. */
const cutGroup = alias(photo, 'face_cut_group');
const cutCircle = alias(circle, 'face_cut_circle');

export function createDrizzlePersonFaceReads(
	db: BunSQLiteDatabase<typeof schema>
): PersonFaceReads {
	return {
		async listFacesOfVisibleTo(
			viewer: Viewer,
			contactIds: readonly string[]
		): Promise<PersonFace[]> {
			if (contactIds.length === 0) return [];
			const rows = db
				.select({
					contactId: contact.id,
					photoId: photo.id,
					datedAt: sql<number>`CASE WHEN ${photo.framingOf} IS NOT NULL THEN ${photoDatedAt(source)} WHEN ${cutCircle.id} IS NOT NULL THEN ${photoDatedAt(cutGroup)} ELSE ${photoDatedAt(photo)} END`,
					circleId: sql<string | null>`coalesce(${sourceCircle.id}, ${cutCircle.id})`
				})
				.from(photo)
				.innerJoin(contact, eq(photo.contactId, contact.id))
				.leftJoin(source, eq(source.id, photo.framingOf))
				.leftJoin(sourceCircle, eq(sourceCircle.id, source.circleId))
				.leftJoin(cutGroup, eq(cutGroup.id, photo.cutFrom))
				.leftJoin(cutCircle, cutCircleVisible(viewer))
				.where(
					and(
						inArray(photo.contactId, [...contactIds]),
						sql`+${photo.journalEntryId} IS NULL`,
						sql`+${photo.circleId} IS NULL`,
						childRecordVisibleTo(viewer, {
							visibility: photo.visibility,
							createdBy: photo.createdBy
						}),
						or(squarePicture(), visibleFramingSource(viewer))
					)
				)
				.all();
			return rows;
		}
	};
}

/** A picture of its own that is square: an avatar upload, an Immich copy, a former cut. */
function squarePicture() {
	return and(isNull(photo.framingOf), isNotNull(photo.width), eq(photo.width, photo.height));
}

/** A framing whose source the reader sees: the person's own gallery photo, or a circle photo. */
function visibleFramingSource(viewer: Viewer) {
	const owner = { visibility: source.visibility, createdBy: source.createdBy };
	return and(
		isNotNull(photo.framingOf),
		isNull(source.journalEntryId),
		or(
			and(
				isNull(source.circleId),
				eq(source.contactId, photo.contactId),
				childRecordVisibleTo(viewer, owner)
			),
			and(isNotNull(source.circleId), circlePhotoColumnsVisibleTo(viewer, sourceCircle, owner))
		)
	);
}

/** The circle of a former cut's group photo, joined only when the reader may see that photo. */
function cutCircleVisible(viewer: Viewer) {
	return and(
		eq(cutCircle.id, cutGroup.circleId),
		circlePhotoColumnsVisibleTo(viewer, cutCircle, {
			visibility: cutGroup.visibility,
			createdBy: cutGroup.createdBy
		})
	);
}
