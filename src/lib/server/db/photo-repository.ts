import { and, eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { authoredRemovableBy } from '../access/query-scoping';
import type { Remover } from '../access/visibility';
import { activityEntry, type ActivityOf } from '../domain/activity/activity';
import type { DeletedPhotoFiles, PhotoRepository, StoredPhoto } from '../domain/media/avatars';
import { keepCutLeftBehind } from './cut-turning';
import { isGalleryPhoto } from './gallery-photo-scope';
import type * as schema from './schema';
import { activityLog, contact, photo, user } from './schema';

/*
 * Drizzle adapter for the PhotoRepository port (docs/08 §8.3): the photo record's writes. A
 * write to a gallery photo touches only a gallery photo (`isGalleryPhoto`) and only the
 * author's own; the reads are read models of their own (`gallery-photo-reads.ts`,
 * `journal-photo-reads.ts`, `photo-file-reads.ts`) and framings are `framing-repository.ts`.
 */
export function createDrizzlePhotoRepository(
	db: BunSQLiteDatabase<typeof schema>
): PhotoRepository {
	const removableBy = (remover: Remover) =>
		authoredRemovableBy(remover, { visibility: photo.visibility, createdBy: photo.createdBy });

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

		async findRemovableGalleryPhoto(remover: Remover, photoId: string) {
			const row = db
				.select({
					id: photo.id,
					contactId: photo.contactId,
					person: contact.displayName,
					personVisibility: contact.visibility,
					authorId: photo.createdBy,
					authorName: user.name
				})
				.from(photo)
				.innerJoin(contact, eq(photo.contactId, contact.id))
				.innerJoin(user, eq(photo.createdBy, user.id))
				.where(and(eq(photo.id, photoId), isGalleryPhoto(), removableBy(remover)))
				.get();
			return row ?? null;
		},

		async deleteRemovableGalleryPhoto(
			remover: Remover,
			photoId: string,
			audit: ActivityOf<'record.removed'> | null
		): Promise<DeletedPhotoFiles[] | null> {
			return db.transaction((tx) => {
				// SQLite's DELETE takes no join, so the rule — which needs the contact — picks the id.
				const removable = tx
					.select({ id: photo.id })
					.from(photo)
					.innerJoin(contact, eq(photo.contactId, contact.id))
					.where(and(eq(photo.id, photoId), isGalleryPhoto(), removableBy(remover)))
					.get();
				if (!removable) return null;
				const removed = tx
					.delete(photo)
					.where(eq(photo.id, photoId))
					.returning({ filePath: photo.filePath, thumbPath: photo.thumbPath })
					.all();
				const framings = tx
					.delete(photo)
					.where(eq(photo.framingOf, photoId))
					.returning({ id: photo.id, filePath: photo.filePath, thumbPath: photo.thumbPath })
					.all();
				// The avatar column carries no foreign key, so a contact would otherwise keep
				// pointing at bytes that no longer exist — the photo's own, or its framing's.
				const worn = [photoId, ...framings.map((f) => f.id)];
				for (const id of worn) {
					tx.update(contact)
						.set({ avatarPhotoId: null })
						.where(eq(contact.avatarPhotoId, id))
						.run();
				}
				if (audit) tx.insert(activityLog).values(activityEntry(audit)).run();
				return [
					...removed,
					...framings.map(({ filePath, thumbPath }) => ({ filePath, thumbPath }))
				];
			});
		}
	};
}
