import type { Database } from 'bun:sqlite';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { Clock } from '../clock';
import { createDrizzleArchiveRepository } from '../db/archive-repository';
import { createDrizzleImportRepository } from '../db/import-repository';
import { createDrizzleRestoreRepository } from '../db/restore-repository';
import type * as schema from '../db/schema';
import type { ArchiveDeps } from '../domain/archive/archive';
import type { ImportArchiveDeps } from '../domain/archive/import';
import type { ImportDeps } from '../domain/import/apply';
import type { MediaStore } from '../domain/media/avatars';
import { activityWording } from '../i18n/activity-wording';
import type { IdGenerator } from '../id';

/*
 * The `archive` bounded context of the composition root (docs/08 §8.3): moving a household in
 * or out — the archive export, the archive restore and the Monica import (docs/02 §2.15,
 * §2.16). Built once per process by `createServices`; the edge reads it off
 * `locals.services.archive`.
 *
 * No edge reads a repository of it directly, so it holds only use-cases' `deps`, each named
 * after its type (`archiveDeps` is an `ArchiveDeps`).
 */
export interface ArchiveServices {
	/** Exporting the household as one archive (docs/02 §2.15). */
	archiveDeps: ArchiveDeps;
	/** Restoring a household from an archive, its images into the one media store. */
	importArchiveDeps: ImportArchiveDeps;
	/** The Monica import (docs/02 §2.16); the wizard is the only caller. */
	importDeps: ImportDeps;
}

export interface ArchiveWiring {
	db: BunSQLiteDatabase<typeof schema>;
	/**
	 * The raw handle behind `db`: the export and the restore assemble their statements from a
	 * table list rather than the typed schema (`archive-repository.ts`).
	 */
	sqlite: Database;
	clock: Clock;
	ids: IdGenerator;
	/** The media context's store, which a restore writes the archive's images into. */
	media: MediaStore;
	/** The gifts context's conversion, run after a restore on what an older archive held. */
	convertHeldGifts: ImportArchiveDeps['convertHeldGifts'];
}

export function createArchiveServices({
	db,
	sqlite,
	clock,
	ids,
	media,
	convertHeldGifts
}: ArchiveWiring): ArchiveServices {
	return {
		archiveDeps: { archive: createDrizzleArchiveRepository(db, sqlite), ids, clock },
		importArchiveDeps: {
			restore: createDrizzleRestoreRepository(db, sqlite, activityWording),
			media,
			ids,
			clock,
			convertHeldGifts
		},
		importDeps: { importer: createDrizzleImportRepository(db), clock }
	};
}
