import { eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { DeletedPhotoFiles } from '../domain/media/avatars';
import type { FramingRepository, StoredFraming } from '../domain/media/framing';
import { keepCutLeftBehind } from './cut-turning';
import type * as schema from './schema';
import { contact, photo } from './schema';

/*
 * Drizzle adapter for the FramingRepository port (docs/08 §8.3): a framing is a photo row of its
 * own that points at the gallery photo it frames (docs/02 §2.14). Unscoped: `frameAsAvatar` has
 * already found the photo visible to whoever chose the square.
 */
export function createDrizzleFramingRepository(
	db: BunSQLiteDatabase<typeof schema>
): FramingRepository {
	return {
		async replaceFraming(f: StoredFraming): Promise<DeletedPhotoFiles[]> {
			return db.transaction((tx) => {
				// A profile picture cut from a group photo stays theirs as a photo (concept §5.2).
				keepCutLeftBehind(tx, f.contactId, { framingOf: f.framingOf });
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
