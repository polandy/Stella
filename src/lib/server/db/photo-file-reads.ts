import { and, eq, isNotNull, or } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { childRecordVisibleTo, circlePhotoVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { PhotoFile, PhotoFileReads, PhotoVariant } from '../domain/media/avatars';
import type * as schema from './schema';
import { circle, contact, photo } from './schema';

/*
 * Drizzle adapter for which file `/media/[id]` serves (docs/08 §8.3). Serving a photo file is
 * scoped through the central `childRecordVisibleTo`: the photo's contact must be visible and a
 * private photo only to its author (docs/03 §3.7) — so private media is never served to others.
 * A circle's photo has no contact; it is served by `circlePhotoVisibleTo`, its circle's rule.
 */
export function createDrizzlePhotoFileReads(db: BunSQLiteDatabase<typeof schema>): PhotoFileReads {
	return {
		async getVisiblePhotoFile(
			viewer: Viewer,
			photoId: string,
			variant: PhotoVariant
		): Promise<PhotoFile | null> {
			const owner = { visibility: photo.visibility, createdBy: photo.createdBy };
			const row = db
				.select({
					filePath: photo.filePath,
					thumbPath: photo.thumbPath,
					viewPath: photo.viewPath,
					mime: photo.mime,
					visibility: photo.visibility,
					createdBy: photo.createdBy
				})
				.from(photo)
				.leftJoin(contact, eq(photo.contactId, contact.id))
				.leftJoin(circle, eq(photo.circleId, circle.id))
				.where(
					and(
						eq(photo.id, photoId),
						or(
							and(isNotNull(photo.contactId), childRecordVisibleTo(viewer, owner)),
							and(isNotNull(photo.circleId), circlePhotoVisibleTo(viewer, owner))
						)
					)
				)
				.get();
			if (!row) return null;
			// A photo stored before there was a view (or small enough not to need one) is its own view.
			const path = { full: row.filePath, view: row.viewPath ?? row.filePath, thumb: row.thumbPath }[
				variant
			];
			return { path, mime: row.mime };
		}
	};
}
