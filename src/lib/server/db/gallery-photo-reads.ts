import { and, desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { childRecordVisibleTo, circlePhotoColumnsVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { GalleryPhoto } from '../domain/media/avatars';
import type { GalleryPhotoReads } from '../domain/media/gallery';
import { isGalleryPhoto } from './gallery-photo-scope';
import { photoDatedAt } from './photo-dated-at';
import type * as schema from './schema';
import { circle, contact, photo } from './schema';

/*
 * Drizzle adapter for the gallery's read model (docs/08 §8.3). Reads are scoped through the
 * central `childRecordVisibleTo`, so a private photo reaches only its author (docs/03 §3.7).
 */
export function createDrizzleGalleryPhotoReads(
	db: BunSQLiteDatabase<typeof schema>
): GalleryPhotoReads {
	return {
		async listGalleryPhotos(viewer: Viewer, contactId: string): Promise<GalleryPhoto[]> {
			return db
				.select(GALLERY_COLUMNS)
				.from(photo)
				.innerJoin(contact, eq(photo.contactId, contact.id))
				.leftJoin(framing, eq(framing.framingOf, photo.id))
				.leftJoin(cutGroup, eq(cutGroup.id, photo.cutFrom))
				.leftJoin(cutCircle, cutCircleVisible(viewer))
				.where(and(eq(photo.contactId, contactId), isGalleryPhotoVisibleTo(viewer)))
				.orderBy(desc(photoDatedAt(photo)))
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
				.leftJoin(cutGroup, eq(cutGroup.id, photo.cutFrom))
				.leftJoin(cutCircle, cutCircleVisible(viewer))
				.where(
					and(
						eq(photo.id, photoId),
						eq(photo.contactId, contactId),
						isGalleryPhotoVisibleTo(viewer)
					)
				)
				.get();
			return row ? toGalleryPhoto(row) : null;
		}
	};
}

/** A gallery photo the viewer may see: a private one only by its author. */
function isGalleryPhotoVisibleTo(viewer: Viewer) {
	return and(
		isGalleryPhoto(),
		childRecordVisibleTo(viewer, { visibility: photo.visibility, createdBy: photo.createdBy })
	);
}

/** A photo's framing, joined beside it; each photo has at most one. */
const framing = alias(photo, 'framing');

/** The group photo a gallery photo was cut from (concept §5.2), and its circle. */
const cutGroup = alias(photo, 'cut_group');
const cutCircle = alias(circle, 'cut_circle');

/** The group photo's circle, joined only when the viewer may see that group photo. */
function cutCircleVisible(viewer: Viewer) {
	return and(
		eq(cutCircle.id, cutGroup.circleId),
		circlePhotoColumnsVisibleTo(viewer, cutCircle, {
			visibility: cutGroup.visibility,
			createdBy: cutGroup.createdBy
		})
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
	takenAt: photo.takenAt,
	createdAt: photo.createdAt,
	isAvatar: sql<number>`(${contact.avatarPhotoId} IN (${photo.id}, ${framing.id}))`,
	cropX: framing.cropX,
	cropY: framing.cropY,
	cropSize: framing.cropSize,
	pinnedAt: photo.pinnedAt,
	cutFromId: cutGroup.id,
	cutCircleId: cutCircle.id,
	cutCircleName: cutCircle.name
};

type GalleryRow = {
	id: string;
	contactId: string | null;
	caption: string | null;
	visibility: 'shared' | 'private';
	createdBy: string;
	width: number | null;
	height: number | null;
	takenAt: string | null;
	createdAt: number;
	isAvatar: number | null;
	cropX: number | null;
	cropY: number | null;
	cropSize: number | null;
	pinnedAt: number | null;
	cutFromId: string | null;
	cutCircleId: string | null;
	cutCircleName: string | null;
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
	takenAt: row.takenAt,
	createdAt: row.createdAt,
	isAvatar: row.isAvatar === 1,
	framing:
		row.cropX !== null && row.cropY !== null && row.cropSize !== null
			? { x: row.cropX, y: row.cropY, size: row.cropSize }
			: null,
	pinnedAt: row.pinnedAt,
	cutFrom:
		row.cutFromId !== null && row.cutCircleId !== null && row.cutCircleName !== null
			? { photoId: row.cutFromId, circleId: row.cutCircleId, circleName: row.cutCircleName }
			: null
});
