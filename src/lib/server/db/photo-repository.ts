import { and, eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { DeletedPhotoFiles, PhotoRepository, StoredPhoto } from '../domain/media/avatars';
import { keepCutLeftBehind } from './cut-turning';
import { isGalleryPhoto } from './gallery-photo-scope';
import type * as schema from './schema';
import { contact, photo } from './schema';

/*
 * Drizzle adapter for the PhotoRepository port (docs/08 §8.3): the photo record's writes. A
 * write to a gallery photo touches only a gallery photo (`isGalleryPhoto`) and only the
 * author's own; the reads are read models of their own (`gallery-photo-reads.ts`,
 * `journal-photo-reads.ts`, `photo-file-reads.ts`) and framings are `framing-repository.ts`.
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
					takenAt: p.takenAt,
					createdAt: p.createdAt
				})
				.run();
		},

		async exists(id: string) {
			return db.select({ id: photo.id }).from(photo).where(eq(photo.id, id)).get() !== undefined;
		},

		async setContactAvatar(contactId: string, photoId: string) {
			db.transaction((tx) => {
				// A profile picture cut from a group photo stays theirs as a photo (concept §5.2).
				keepCutLeftBehind(tx, contactId, { framingOf: null });
				tx.update(contact).set({ avatarPhotoId: photoId }).where(eq(contact.id, contactId)).run();
			});
		},

		async setGalleryPhotoPin(photoId: string, pinnedAt: number | null) {
			db.update(photo)
				.set({ pinnedAt })
				.where(and(eq(photo.id, photoId), isGalleryPhoto()))
				.run();
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
					.where(
						and(eq(photo.id, input.photoId), eq(photo.createdBy, input.authorId), isGalleryPhoto())
					)
					.returning({ id: photo.id })
					.all();
				// A framing is seen by exactly who sees its photo (domain/media/framing.ts).
				if (updated.length > 0 && changes.visibility) {
					tx.update(photo)
						.set({ visibility: changes.visibility })
						.where(eq(photo.framingOf, input.photoId))
						.run();
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
					.where(
						and(eq(photo.id, input.photoId), eq(photo.createdBy, input.authorId), isGalleryPhoto())
					)
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
					tx.update(contact)
						.set({ avatarPhotoId: null })
						.where(eq(contact.avatarPhotoId, id))
						.run();
				}
				return [
					...removed,
					...framings.map(({ filePath, thumbPath }) => ({ filePath, thumbPath }))
				];
			});
		}
	};
}
