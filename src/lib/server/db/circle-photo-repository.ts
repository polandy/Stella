import { and, eq, isNotNull } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { circlePhotoVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type {
	CirclePhoto,
	CirclePhotoDescription,
	CirclePhotoRepository,
	StoredCirclePhoto
} from '../domain/circles/circle-photos';
import { turnCutsOfGroupPhotos } from './cut-turning';
import type * as schema from './schema';
import { circle, photo, user } from './schema';

/*
 * Drizzle adapter for the circle photo port (docs/02 §2.4.2, docs/08 §8.3). Every read joins the
 * photo's circle and is scoped by the central `circlePhotoVisibleTo` (docs/03 §3.7): the circle
 * must be visible and a private photo only to whoever added it. Writes that are the uploader's
 * carry the author in their WHERE, so a forged id changes nothing.
 */
export function createDrizzleCirclePhotoRepository(
	db: BunSQLiteDatabase<typeof schema>
): CirclePhotoRepository {
	const visibleTo = (viewer: Viewer) =>
		circlePhotoVisibleTo(viewer, { visibility: photo.visibility, createdBy: photo.createdBy });

	const select = () =>
		db
			.select(COLUMNS)
			.from(photo)
			.innerJoin(circle, eq(photo.circleId, circle.id))
			.innerJoin(user, eq(photo.createdBy, user.id));

	return {
		async insert(p: StoredCirclePhoto) {
			db.insert(photo)
				.values({
					id: p.id,
					householdId: p.householdId,
					contactId: null,
					journalEntryId: null,
					circleId: p.circleId,
					circleRole: p.circleRole,
					createdBy: p.createdBy,
					visibility: p.visibility,
					filePath: p.filePath,
					thumbPath: p.thumbPath,
					viewPath: p.viewPath,
					mime: p.mime,
					width: p.width,
					height: p.height,
					sizeBytes: p.sizeBytes,
					takenAt: p.takenAt,
					createdAt: p.createdAt
				})
				.run();
		},

		async listVisible(viewer: Viewer, circleId: string): Promise<CirclePhoto[]> {
			return select()
				.where(and(eq(photo.circleId, circleId), visibleTo(viewer)))
				.all()
				.map(toCirclePhoto);
		},

		async findVisible(viewer: Viewer, circleId: string, photoId: string): Promise<CirclePhoto | null> {
			const row = select()
				.where(and(eq(photo.id, photoId), eq(photo.circleId, circleId), visibleTo(viewer)))
				.get();
			return row ? toCirclePhoto(row) : null;
		},

		async describe(photoId: string, changes: CirclePhotoDescription) {
			const set: { caption?: string | null; circleRole?: string | null; pinnedAt?: number | null } = {};
			if ('caption' in changes) set.caption = changes.caption ?? null;
			if ('role' in changes) set.circleRole = changes.role ?? null;
			if ('pinnedAt' in changes) set.pinnedAt = changes.pinnedAt ?? null;
			if (Object.keys(set).length === 0) return;
			db.update(photo).set(set).where(and(eq(photo.id, photoId), isNotNull(photo.circleId))).run();
		},

		async setOwnVisibility(input) {
			return db.transaction((tx) => {
				const own = tx.select({ id: photo.id }).from(photo).where(ownPhoto(input)).get();
				if (!own) return false;
				// Nobody's face turns private with the group photo: the cuts become their own first (§5.4).
				if (input.visibility === 'private') turnCutsOfGroupPhotos(tx, [own.id], 'groupPhotoPrivate');
				tx.update(photo).set({ visibility: input.visibility }).where(eq(photo.id, own.id)).run();
				// The cuts made while it was private follow it, as any framing follows its photo.
				tx.update(photo).set({ visibility: input.visibility }).where(eq(photo.framingOf, own.id)).run();
				return true;
			});
		},

		async deleteOwn(input) {
			return db.transaction((tx) => {
				const own = tx.select({ id: photo.id }).from(photo).where(ownPhoto(input)).get();
				if (!own) return null;
				// Nobody's face goes with the group photo: the cuts become their own first (§5.4).
				turnCutsOfGroupPhotos(tx, [own.id], 'groupPhotoRemoved');
				const removed = tx
					.delete(photo)
					.where(eq(photo.id, own.id))
					.returning({ filePath: photo.filePath, thumbPath: photo.thumbPath, viewPath: photo.viewPath })
					.all();
				return removed[0] ?? null;
			});
		},

		async listCoverCandidates(viewer: Viewer): Promise<CirclePhoto[]> {
			return select().where(visibleTo(viewer)).all().map(toCirclePhoto);
		}
	};
}

/** A photo of that circle that `authorId` added. */
function ownPhoto(input: { authorId: string; circleId: string; photoId: string }) {
	return and(
		eq(photo.id, input.photoId),
		eq(photo.circleId, input.circleId),
		eq(photo.createdBy, input.authorId)
	);
}

const COLUMNS = {
	id: photo.id,
	circleId: photo.circleId,
	role: photo.circleRole,
	caption: photo.caption,
	visibility: photo.visibility,
	createdBy: photo.createdBy,
	createdByName: user.name,
	width: photo.width,
	height: photo.height,
	takenAt: photo.takenAt,
	createdAt: photo.createdAt,
	pinnedAt: photo.pinnedAt
};

// circleId is non-null here: every read joins the photo's circle.
const toCirclePhoto = (row: { circleId: string | null } & Omit<CirclePhoto, 'circleId'>): CirclePhoto => ({
	...row,
	circleId: row.circleId as string
});
