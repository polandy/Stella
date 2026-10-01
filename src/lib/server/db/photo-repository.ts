import { and, asc, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { childRecordVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type {
	DeletedPhotoFiles,
	GalleryPhoto,
	JournalPhotoRef,
	PhotoFile,
	PhotoRepository,
	StoredPhoto
} from '../domain/media/avatars';
import type { FramingRepository, StoredFraming } from '../domain/media/framing';
import type * as schema from './schema';
import { contact, photo } from './schema';

/*
 * Drizzle adapter for the PhotoRepository port (docs/08 §8.3). Serving a photo file is scoped
 * through the central `childRecordVisibleTo`: the photo's contact must be visible and a private
 * photo only to its author (docs/03 §3.7) — so private media is never served to others.
 */
export function createDrizzlePhotoRepository(
	db: BunSQLiteDatabase<typeof schema>
): PhotoRepository & FramingRepository {
	/** A person's journal photos the viewer may see, oldest first, among the entries `entries` picks. */
	function journalPhotosWhere(viewer: Viewer, contactId: string, entries: SQL): JournalPhotoRef[] {
		const rows = db
			.select({ id: photo.id, journalEntryId: photo.journalEntryId })
			.from(photo)
			.innerJoin(contact, eq(photo.contactId, contact.id))
			.where(
				and(
					eq(photo.contactId, contactId),
					entries,
					childRecordVisibleTo(viewer, { visibility: photo.visibility, createdBy: photo.createdBy })
				)
			)
			.orderBy(asc(photo.createdAt))
			.all();
		// journalEntryId is non-null here: both filters only pick photos of an entry.
		return rows.map((r) => ({ id: r.id, journalEntryId: r.journalEntryId as string }));
	}

	return {
		async insert(p: StoredPhoto) {
			db.insert(photo)
				.values({
					id: p.id,
					householdId: p.householdId,
					contactId: p.contactId,
					journalEntryId: p.journalEntryId,
					createdBy: p.createdBy,
					visibility: p.visibility,
					filePath: p.filePath,
					thumbPath: p.thumbPath,
					mime: p.mime,
					width: p.width,
					height: p.height,
					sizeBytes: p.sizeBytes,
					createdAt: p.createdAt
				})
				.run();
		},

		async exists(id: string) {
			return db.select({ id: photo.id }).from(photo).where(eq(photo.id, id)).get() !== undefined;
		},

		async setContactAvatar(contactId: string, photoId: string) {
			db.update(contact).set({ avatarPhotoId: photoId }).where(eq(contact.id, contactId)).run();
		},

		async getVisiblePhotoFile(
			viewer: Viewer,
			photoId: string,
			variant: 'full' | 'thumb'
		): Promise<PhotoFile | null> {
			const row = db
				.select({
					filePath: photo.filePath,
					thumbPath: photo.thumbPath,
					mime: photo.mime,
					visibility: photo.visibility,
					createdBy: photo.createdBy
				})
				.from(photo)
				.innerJoin(contact, eq(photo.contactId, contact.id))
				.where(
					and(
						eq(photo.id, photoId),
						childRecordVisibleTo(viewer, { visibility: photo.visibility, createdBy: photo.createdBy })
					)
				)
				.get();
			if (!row) return null;
			return { path: variant === 'thumb' ? row.thumbPath : row.filePath, mime: row.mime };
		},

		async listJournalPhotos(viewer: Viewer, contactId: string): Promise<JournalPhotoRef[]> {
			return journalPhotosWhere(viewer, contactId, isNotNull(photo.journalEntryId));
		},

		async listJournalPhotosOfEntries(
			viewer: Viewer,
			contactId: string,
			entryIds: readonly string[]
		): Promise<JournalPhotoRef[]> {
			if (entryIds.length === 0) return [];
			return journalPhotosWhere(viewer, contactId, inArray(photo.journalEntryId, [...entryIds]));
		},

		async listGalleryPhotos(viewer: Viewer, contactId: string): Promise<GalleryPhoto[]> {
			return db
				.select(GALLERY_COLUMNS)
				.from(photo)
				.innerJoin(contact, eq(photo.contactId, contact.id))
				.leftJoin(framing, eq(framing.framingOf, photo.id))
				.where(and(eq(photo.contactId, contactId), isGalleryPhotoVisibleTo(viewer)))
				.orderBy(desc(photo.createdAt))
				.all()
				.map(toGalleryPhoto);
		},

		async findVisibleGalleryPhoto(
			viewer: Viewer,
			contactId: string,
			photoId: string
		): Promise<GalleryPhoto | null> {
			const row = db
				.select(GALLERY_COLUMNS)
				.from(photo)
				.innerJoin(contact, eq(photo.contactId, contact.id))
				.leftJoin(framing, eq(framing.framingOf, photo.id))
				.where(
					and(eq(photo.id, photoId), eq(photo.contactId, contactId), isGalleryPhotoVisibleTo(viewer))
				)
				.get();
			return row ? toGalleryPhoto(row) : null;
		},

		async updateOwnGalleryPhoto(input: {
			authorId: string;
			photoId: string;
			caption?: string | null;
			visibility?: 'shared' | 'private';
		}): Promise<boolean> {
			const changes: { caption?: string | null; visibility?: 'shared' | 'private' } = {};
			if ('caption' in input) changes.caption = input.caption ?? null;
			if (input.visibility) changes.visibility = input.visibility;
			if (Object.keys(changes).length === 0) return false;
			return db.transaction((tx) => {
				const updated = tx
					.update(photo)
					.set(changes)
					.where(and(eq(photo.id, input.photoId), eq(photo.createdBy, input.authorId), isGalleryPhoto()))
					.returning({ id: photo.id })
					.all();
				// A framing is seen by exactly who sees its photo (domain/media/framing.ts).
				if (updated.length > 0 && changes.visibility) {
					tx.update(photo).set({ visibility: changes.visibility }).where(eq(photo.framingOf, input.photoId)).run();
				}
				return updated.length > 0;
			});
		},

		async deleteOwnGalleryPhoto(input: {
			authorId: string;
			photoId: string;
		}): Promise<DeletedPhotoFiles[] | null> {
			return db.transaction((tx) => {
				const removed = tx
					.delete(photo)
					.where(and(eq(photo.id, input.photoId), eq(photo.createdBy, input.authorId), isGalleryPhoto()))
					.returning({ filePath: photo.filePath, thumbPath: photo.thumbPath })
					.all();
				if (removed.length === 0) return null;
				const framings = tx
					.delete(photo)
					.where(eq(photo.framingOf, input.photoId))
					.returning({ id: photo.id, filePath: photo.filePath, thumbPath: photo.thumbPath })
					.all();
				// The avatar column carries no foreign key, so a contact would otherwise keep
				// pointing at bytes that no longer exist — the photo's own, or its framing's.
				const worn = [input.photoId, ...framings.map((f) => f.id)];
				for (const id of worn) {
					tx.update(contact).set({ avatarPhotoId: null }).where(eq(contact.avatarPhotoId, id)).run();
				}
				return [...removed, ...framings.map(({ filePath, thumbPath }) => ({ filePath, thumbPath }))];
			});
		},

		async replaceFraming(f: StoredFraming): Promise<DeletedPhotoFiles[]> {
			return db.transaction((tx) => {
				const replaced = tx
					.delete(photo)
					.where(eq(photo.framingOf, f.framingOf))
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
		}
	};
}

/*
 * A gallery photo is one that belongs to no journal entry (docs/02 §2.14 vs §2.20) and is not
 * the framing of another photo. Reads are scoped through the central `childRecordVisibleTo`, so
 * a private photo reaches only its author.
 */
function isGalleryPhoto() {
	return and(isNull(photo.journalEntryId), isNull(photo.framingOf));
}

function isGalleryPhotoVisibleTo(viewer: Viewer) {
	return and(
		isGalleryPhoto(),
		childRecordVisibleTo(viewer, { visibility: photo.visibility, createdBy: photo.createdBy })
	);
}

/** A photo's framing, joined beside it; each photo has at most one. */
const framing = alias(photo, 'framing');

const GALLERY_COLUMNS = {
	id: photo.id,
	contactId: photo.contactId,
	caption: photo.caption,
	visibility: photo.visibility,
	createdBy: photo.createdBy,
	width: photo.width,
	height: photo.height,
	createdAt: photo.createdAt,
	isAvatar: sql<number>`(${contact.avatarPhotoId} IN (${photo.id}, ${framing.id}))`,
	cropX: framing.cropX,
	cropY: framing.cropY,
	cropSize: framing.cropSize
};

type GalleryRow = {
	id: string;
	contactId: string | null;
	caption: string | null;
	visibility: 'shared' | 'private';
	createdBy: string;
	width: number | null;
	height: number | null;
	createdAt: number;
	isAvatar: number | null;
	cropX: number | null;
	cropY: number | null;
	cropSize: number | null;
};

/** SQLite has no booleans; the avatar flag arrives as 0/1 and is mapped here, at the boundary. */
const toGalleryPhoto = (row: GalleryRow): GalleryPhoto => ({
	id: row.id,
	contactId: row.contactId ?? '',
	caption: row.caption,
	visibility: row.visibility,
	createdBy: row.createdBy,
	width: row.width,
	height: row.height,
	createdAt: row.createdAt,
	isAvatar: row.isAvatar === 1,
	framing:
		row.cropX !== null && row.cropY !== null && row.cropSize !== null
			? { x: row.cropX, y: row.cropY, size: row.cropSize }
			: null
});
