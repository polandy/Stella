import { and, eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { childRecordVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { PhotoFile, PhotoRepository, StoredPhoto } from '../domain/media/avatars';
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
		}
	};
}
