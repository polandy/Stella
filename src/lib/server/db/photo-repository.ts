import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
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
import type * as schema from './schema';
import { contact, photo } from './schema';

/*
 * Drizzle adapter for the PhotoRepository port (docs/08 §8.3). Serving a photo file is scoped
 * through the central `childRecordVisibleTo`: the photo's contact must be visible and a private
 * photo only to its author (docs/03 §3.7) — so private media is never served to others.
 */
export function createDrizzlePhotoRepository(
	db: BunSQLiteDatabase<typeof schema>
): PhotoRepository {
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
			const rows = db
				.select({ id: photo.id, journalEntryId: photo.journalEntryId })
				.from(photo)
				.innerJoin(contact, eq(photo.contactId, contact.id))
				.where(
					and(
						eq(photo.contactId, contactId),
						isNotNull(photo.journalEntryId),
						childRecordVisibleTo(viewer, { visibility: photo.visibility, createdBy: photo.createdBy })
					)
				)
				.orderBy(asc(photo.createdAt))
				.all();
			// journalEntryId is non-null here by the isNotNull filter.
			return rows.map((r) => ({ id: r.id, journalEntryId: r.journalEntryId as string }));
		},

		async listGalleryPhotos(viewer: Viewer, contactId: string): Promise<GalleryPhoto[]> {
			return db
				.select(GALLERY_COLUMNS)
				.from(photo)
				.innerJoin(contact, eq(photo.contactId, contact.id))
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
			const updated = db
				.update(photo)
				.set(changes)
				.where(and(eq(photo.id, input.photoId), eq(photo.createdBy, input.authorId), isNull(photo.journalEntryId)))
				.returning({ id: photo.id })
				.all();
			return updated.length > 0;
		},

		async deleteOwnGalleryPhoto(input: {
			authorId: string;
			photoId: string;
		}): Promise<DeletedPhotoFiles | null> {
			return db.transaction((tx) => {
				const removed = tx
					.delete(photo)
					.where(
						and(
							eq(photo.id, input.photoId),
							eq(photo.createdBy, input.authorId),
							isNull(photo.journalEntryId)
						)
					)
					.returning({ filePath: photo.filePath, thumbPath: photo.thumbPath })
					.all();
				const files = removed[0];
				if (!files) return null;
				// The avatar column carries no foreign key, so a contact would otherwise keep
				// pointing at bytes that no longer exist.
				tx.update(contact)
					.set({ avatarPhotoId: null })
					.where(eq(contact.avatarPhotoId, input.photoId))
					.run();
				return files;
			});
		}
	};
}

/*
 * A gallery photo is one that belongs to no journal entry (docs/02 §2.14 vs §2.20). Reads are
 * scoped through the central `childRecordVisibleTo`, so a private photo reaches only its author.
 */
function isGalleryPhotoVisibleTo(viewer: Viewer) {
	return and(
		isNull(photo.journalEntryId),
		childRecordVisibleTo(viewer, { visibility: photo.visibility, createdBy: photo.createdBy })
	);
}

const GALLERY_COLUMNS = {
	id: photo.id,
	contactId: photo.contactId,
	caption: photo.caption,
	visibility: photo.visibility,
	createdBy: photo.createdBy,
	width: photo.width,
	height: photo.height,
	createdAt: photo.createdAt,
	isAvatar: sql<number>`(${contact.avatarPhotoId} = ${photo.id})`
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
	isAvatar: row.isAvatar === 1
});
