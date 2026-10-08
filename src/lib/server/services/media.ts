import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { Clock } from '../clock';
import type { Config } from '../config';
import { createDrizzleFramingRepository } from '../db/framing-repository';
import { createDrizzleGalleryPhotoReads } from '../db/gallery-photo-reads';
import { createDrizzleJournalPhotoReads } from '../db/journal-photo-reads';
import { createDrizzlePhotoFileReads } from '../db/photo-file-reads';
import { createDrizzlePhotoRepository } from '../db/photo-repository';
import type * as schema from '../db/schema';
import { createDrizzleStreamRepository } from '../db/stream-repository';
import type { ImportedPhotoDeps } from '../domain/import/monica/photos';
import type {
	AvatarDeps,
	MediaStore,
	MediaStreamSource,
	PhotoFileReads
} from '../domain/media/avatars';
import type { FramingDeps } from '../domain/media/framing';
import type { GalleryDeps } from '../domain/media/gallery';
import type { GalleryUploadDeps } from '../domain/media/gallery-upload';
import type { JournalPhotoDeps, JournalPhotoReads } from '../domain/media/journal-photos';
import type { StreamDeps } from '../domain/stream/stream';
import type { IdGenerator } from '../id';
import { createFileMediaStore } from '../media/file-store';
import { createFileMediaStreamSource } from '../media/file-stream-source';

/*
 * The `media` bounded context of the composition root (docs/08 §8.3): a person's photos — the
 * avatar, the gallery, the square a gallery photo is worn through, journal photos and the ones
 * an import brings — the store their bytes live in, and the home stream that shows them.
 * Built once per process by `createServices`; the edge reads it off `locals.services.media`.
 *
 * A read model an edge reads directly sits under its noun (`journalPhotos`, `photoFiles`); the
 * store, which the archive export reads, sits under `store`, and the files `/media` streams under
 * `streams`; everything else is a use-case's `deps`, named after its type (`galleryDeps` is a
 * `GalleryDeps`).
 */
export interface MediaServices {
	/** The journal photos the story pages read beside their entries. */
	journalPhotos: JournalPhotoReads;
	/** Which file `/media/[id]` serves, only when the viewer may see the photo. */
	photoFiles: PhotoFileReads;
	/**
	 * The one media store under `MEDIA_DIR` (docs/04 §4.6): the people and circles contexts
	 * unlink and keep their files through it too.
	 */
	store: MediaStore;
	/** The same directory, streamed to the browser. */
	streams: MediaStreamSource;
	avatarDeps: AvatarDeps;
	importedPhotoDeps: ImportedPhotoDeps;
	galleryDeps: GalleryDeps;
	framingDeps: FramingDeps;
	galleryUploadDeps: GalleryUploadDeps;
	journalPhotoDeps: JournalPhotoDeps;
	streamDeps: StreamDeps;
}

export type MediaConfig = Pick<Config, 'mediaDir'>;

export interface MediaWiring {
	config: MediaConfig;
	db: BunSQLiteDatabase<typeof schema>;
	clock: Clock;
	ids: IdGenerator;
}

export function createMediaServices({ config, db, clock, ids }: MediaWiring): MediaServices {
	// One adapter per port; the photo writes are one repository every use-case shares.
	const photos = createDrizzlePhotoRepository(db);
	const gallery = createDrizzleGalleryPhotoReads(db);
	// Lazy on disk: nothing is touched until a use-case reads or writes a file.
	const store = createFileMediaStore(config.mediaDir);
	const uploadDeps = { photos, media: store, ids, clock };

	return {
		journalPhotos: createDrizzleJournalPhotoReads(db),
		photoFiles: createDrizzlePhotoFileReads(db),
		store,
		streams: createFileMediaStreamSource(config.mediaDir),
		avatarDeps: uploadDeps,
		importedPhotoDeps: { photos, media: store, clock },
		galleryDeps: { gallery, photos, media: store, clock },
		framingDeps: {
			gallery,
			framings: createDrizzleFramingRepository(db),
			media: store,
			ids,
			clock
		},
		galleryUploadDeps: uploadDeps,
		journalPhotoDeps: uploadDeps,
		streamDeps: { stream: createDrizzleStreamRepository(db) }
	};
}
