import { and, desc, eq, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { circlePhotoVisibleTo, contactVisibleTo, membershipVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type {
	CircleCutRow,
	CutRepository,
	GroupPhoto,
	GroupPhotoOfPerson,
	GroupPhotoToCut
} from '../domain/media/cuts';
import type { DeletedPhotoFiles } from '../domain/media/avatars';
import type { StoredFraming } from '../domain/media/framing';
import { keepCutLeftBehind } from './cut-turning';
import { photoDatedAt } from './photo-dated-at';
import type * as schema from './schema';
import { circle, circleMembership, contact, photo } from './schema';

/*
 * Drizzle adapter for profile pictures cut from a group photo (docs/concepts/circle-photos.md
 * §5, docs/08 §8.3). A cut is a `photo` row with `framing_of` on a circle photo and `contact_id`
 * on the person who wears it. Group photos are read through the central `circlePhotoVisibleTo`
 * and people through `contactVisibleTo` (docs/03 §3.7): a cut is counted on its photo for
 * everyone who sees the photo, but only named for whoever may see the person.
 */
export function createDrizzleCutRepository(db: BunSQLiteDatabase<typeof schema>): CutRepository {
	const visibleGroupPhoto = (viewer: Viewer) =>
		circlePhotoVisibleTo(viewer, { visibility: photo.visibility, createdBy: photo.createdBy });

	return {
		async findVisibleGroupPhoto(viewer: Viewer, photoId: string): Promise<GroupPhoto | null> {
			const row = db
				.select({
					id: photo.id,
					circleId: photo.circleId,
					createdBy: photo.createdBy,
					visibility: photo.visibility,
					width: photo.width,
					height: photo.height
				})
				.from(photo)
				.innerJoin(circle, eq(photo.circleId, circle.id))
				.where(and(eq(photo.id, photoId), visibleGroupPhoto(viewer)))
				.get();
			return row ? { ...row, circleId: row.circleId as string } : null;
		},

		async replaceCut(f: StoredFraming): Promise<DeletedPhotoFiles[]> {
			return db.transaction((tx) => {
				// The cut they wore before becomes theirs; their earlier cut of this photo is replaced.
				keepCutLeftBehind(tx, f.contactId, { framingOf: f.framingOf });
				const replaced = tx
					.delete(photo)
					.where(and(eq(photo.framingOf, f.framingOf), eq(photo.contactId, f.contactId)))
					.returning({ filePath: photo.filePath, thumbPath: photo.thumbPath })
					.all();
				tx.insert(photo)
					.values({
						id: f.id,
						householdId: f.householdId,
						contactId: f.contactId,
						journalEntryId: null,
						framingOf: f.framingOf,
						cropX: f.crop.x,
						cropY: f.crop.y,
						cropSize: f.crop.size,
						createdBy: f.createdBy,
						visibility: f.visibility,
						filePath: f.filePath,
						thumbPath: f.thumbPath,
						mime: f.mime,
						width: f.width,
						height: f.height,
						sizeBytes: f.sizeBytes,
						createdAt: f.createdAt
					})
					.run();
				tx.update(contact).set({ avatarPhotoId: f.id }).where(eq(contact.id, f.contactId)).run();
				return replaced;
			});
		},

		async listCutsOfCircle(viewer: Viewer, circleId: string): Promise<CircleCutRow[]> {
			return db
				.select({
					groupPhotoId: photo.id,
					contactId: cut.contactId,
					personVisible: sql<number>`(${contact.id} IS NOT NULL)`,
					cropX: cut.cropX,
					cropY: cut.cropY,
					cropSize: cut.cropSize
				})
				.from(photo)
				.innerJoin(circle, eq(photo.circleId, circle.id))
				.innerJoin(cut, eq(cut.framingOf, photo.id))
				.leftJoin(contact, and(eq(contact.id, cut.contactId), contactVisibleTo(viewer)))
				.where(and(eq(photo.circleId, circleId), visibleGroupPhoto(viewer)))
				.all()
				.map((row) =>
					row.personVisible === 1 && row.contactId !== null
						? { groupPhotoId: row.groupPhotoId, contactId: row.contactId, crop: cropOf(row) }
						: { groupPhotoId: row.groupPhotoId, contactId: null, crop: null }
				);
		},

		async listGroupPhotosOf(viewer: Viewer, contactId: string): Promise<GroupPhotoOfPerson[]> {
			// Cut from it now (a framing of it), or before (a photo of their own that remembers it).
			const cutFromIt = or(
				and(eq(cut.framingOf, photo.id), eq(cut.contactId, contactId)),
				and(eq(cut.cutFrom, photo.id), eq(cut.contactId, contactId))
			);
			return db
				.selectDistinct(GROUP_PHOTO_COLUMNS)
				.from(photo)
				.innerJoin(circle, eq(photo.circleId, circle.id))
				.innerJoin(cut, cutFromIt)
				.where(visibleGroupPhoto(viewer))
				.orderBy(desc(photoDatedAt(photo)))
				.all()
				.map(groupPhotoOf);
		},

		async listGroupPhotosToCut(viewer: Viewer, contactId: string): Promise<GroupPhotoToCut[]> {
			return db
				.select({
					...GROUP_PHOTO_COLUMNS,
					width: photo.width,
					height: photo.height,
					cropX: cut.cropX,
					cropY: cut.cropY,
					cropSize: cut.cropSize
				})
				.from(photo)
				.innerJoin(circle, eq(photo.circleId, circle.id))
				.innerJoin(
					circleMembership,
					and(eq(circleMembership.circleId, circle.id), eq(circleMembership.contactId, contactId))
				)
				.innerJoin(contact, eq(contact.id, circleMembership.contactId))
				.leftJoin(cut, and(eq(cut.framingOf, photo.id), eq(cut.contactId, contactId)))
				.where(and(visibleGroupPhoto(viewer), membershipVisibleTo(viewer, circle, contact)))
				.orderBy(desc(photoDatedAt(photo)))
				.all()
				.map((row) => ({ ...groupPhotoOf(row), width: row.width, height: row.height, crop: cropOf(row) }));
		}
	};
}

/** A cut beside its group photo: a framing of it, or a photo of its own that remembers it. */
const cut = alias(photo, 'cut');

const GROUP_PHOTO_COLUMNS = {
	id: photo.id,
	circleId: photo.circleId,
	circleName: circle.name,
	takenAt: photo.takenAt,
	createdAt: photo.createdAt
};

// circleId is non-null here: every read joins the photo's circle.
const groupPhotoOf = (row: {
	id: string;
	circleId: string | null;
	circleName: string;
	takenAt: string | null;
	createdAt: number;
}) => ({
	id: row.id,
	circleId: row.circleId as string,
	circleName: row.circleName,
	takenAt: row.takenAt,
	createdAt: row.createdAt
});

function cropOf(row: { cropX: number | null; cropY: number | null; cropSize: number | null }) {
	return row.cropX !== null && row.cropY !== null && row.cropSize !== null
		? { x: row.cropX, y: row.cropY, size: row.cropSize }
		: null;
}
