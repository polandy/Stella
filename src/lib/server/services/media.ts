import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { Clock } from '../clock';
import type { Config } from '../config';
import { createDrizzlePhotoRepository } from '../db/photo-repository';
import type * as schema from '../db/schema';
import { createDrizzleStreamRepository } from '../db/stream-repository';
import type { ImportedPhotoDeps } from '../domain/import/monica/photos';
import type {
	AvatarDeps,
	MediaStore,
	MediaStreamSource,
	PhotoRepository
} from '../domain/media/avatars';
import type { FramingDeps, FramingRepository } from '../domain/media/framing';
import type { GalleryDeps } from '../domain/media/gallery';
import type { GalleryUploadDeps } from '../domain/media/gallery-upload';
import type { JournalPhotoDeps } from '../domain/media/journal-photos';
import type { StreamDeps } from '../domain/stream/stream';
import type { IdGenerator } from '../id';
import { createFileMediaStore } from '../media/file-store';

/*
 * The `media` bounded context of the composition root (docs/08 §8.3): a person's photos — the
 * avatar, the gallery, the square a gallery photo is worn through, journal photos and the ones
 * an import brings — the store their bytes live in, and the home stream that shows them.
 * Built once per process by `createServices`; the edge reads it off `locals.services.media`.
 *
 * A repository an edge reads directly sits under its plural noun (`photos`); the store, which
 * the `/media` route streams from and the archive export reads, sits under `store`; everything
 * else is a use-case's `deps`, named after its type (`galleryDeps` is a `GalleryDeps`).
 */
export interface MediaServices {
	/** The one photo repository: every use-case below reads it, and so do the journal pages. */
	photos: PhotoRepository & FramingRepository;
	/**
	 * The one media store under `MEDIA_DIR` (docs/04 §4.6): the people and circles contexts
	 * unlink and keep their files through it too.
	 */
	store: MediaStore & MediaStreamSource;
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
	// One Drizzle adapter serves both photo ports; each use-case sees only its own.
	const photos = createDrizzlePhotoRepository(db);
	// Lazy on disk: nothing is touched until a use-case reads or writes a file.
	const store = createFileMediaStore(config.mediaDir);
	const photoDeps = { photos, media: store, ids, clock };

	return {
		photos,
		store,
		avatarDeps: photoDeps,
		importedPhotoDeps: { photos, media: store, clock },
		galleryDeps: { photos, media: store, clock },
		framingDeps: { framings: photos, media: store, ids, clock },
		galleryUploadDeps: photoDeps,
		journalPhotoDeps: photoDeps,
		streamDeps: { stream: createDrizzleStreamRepository(db) }
	};
}
