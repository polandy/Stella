import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import type { NewActivityEntry } from '../activity/activity';
import { buildArchiveDocument, type ArchiveDocument } from './document';

/*
 * Exporting the household as one archive (docs/02 §2.15).
 *
 * The archive is a tar of one text file — `household.yaml`, the whole household arranged around
 * its people (`document.ts`) — and the image files beside it under `media/`. Readable with
 * nothing but `tar` and a text editor, and loadable by any program that speaks YAML: an export
 * only this app can open is not data portability.
 *
 * It carries **everything**, private records included, each with the `visibility` it was
 * written with — a restore that loses a member's private journal is not a restore. That is why
 * exporting is admin-only and why it writes itself into the activity log: the household sees
 * that it happened (docs/04 §4.9).
 */

/** The one text file in the archive; everything else beside it is an image. */
export const DOCUMENT_ENTRY = 'household.yaml';

export const MEDIA_PREFIX = 'media/';

/** A media path the archive refuses to carry. */
export class UnsafeMediaPathError extends Error {
	constructor(path: string) {
		super(`"${path}" is not a media path this archive can carry.`);
		this.name = 'UnsafeMediaPathError';
	}
}

/** One table's rows, exactly as they are stored. */
export type TableRows = Record<string, unknown>[];

/** Everything the household owns, as the repository read it. */
export interface HouseholdSnapshot {
	householdName: string;
	/** Table name → its rows, for every table the export covers. */
	tables: Record<string, TableRows>;
	/** Relative media keys (`photo.file_path` / `thumb_path`), deduplicated. */
	mediaPaths: string[];
}

/**
 * The entry name for a media file. Media keys come from the database, so a poisoned row must
 * not be able to reach outside the media directory — on the way out or, later, on the way back
 * in. Anything absolute, empty, or climbing with `..` is refused rather than sanitised.
 */
export function mediaEntryName(path: string): string {
	const bad =
		path.length === 0 ||
		path.startsWith('/') ||
		path.includes('\\') ||
		path.split('/').some((segment) => segment === '..' || segment === '.' || segment === '');
	if (bad) throw new UnsafeMediaPathError(path);
	return MEDIA_PREFIX + path;
}

/** Lowercase, hyphenated, ASCII — a household name that survives every filesystem. */
function slug(name: string): string {
	const s = name
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return s.length > 0 ? s : 'household';
}

/** What the browser saves it as: `stella-<household>-<day>.tar`. */
export function archiveFileName(householdName: string, exportedAt: number): string {
	const day = new Date(exportedAt).toISOString().slice(0, 10);
	return `stella-${slug(householdName)}-${day}.tar`;
}

export interface ArchiveRepository {
	/** Every row the household owns, from every table the export covers. */
	readHousehold(householdId: string): Promise<HouseholdSnapshot>;
	/** Records that an export happened, so the household can see it in the stream. */
	recordExport(entry: NewActivityEntry): Promise<void>;
}

export interface ArchiveDeps {
	archive: ArchiveRepository;
	clock: Clock;
	ids: IdGenerator;
}

export interface ExportedArchive {
	fileName: string;
	/** The whole household as one readable document; the caller writes it as YAML. */
	document: ArchiveDocument;
	/** The image files to put beside it, as relative media keys. */
	mediaPaths: string[];
}

/** What the log says about an export; there is no entity left over to name. */
export function describeExport(counts: Record<string, number>): string {
	const people = counts.contact ?? 0;
	return `exported the household archive (${people} ${people === 1 ? 'person' : 'people'})`;
}

/**
 * Read the household and describe the archive to be written. The caller streams the bytes —
 * this decides what goes in, names the file, and leaves the trail.
 */
export async function exportHousehold(
	deps: ArchiveDeps,
	actor: { userId: string; householdId: string }
): Promise<ExportedArchive> {
	const snapshot = await deps.archive.readHousehold(actor.householdId);
	const exportedAt = deps.clock.now();
	const document = buildArchiveDocument(snapshot, exportedAt);

	await deps.archive.recordExport({
		id: deps.ids.next(),
		householdId: actor.householdId,
		actorId: actor.userId,
		action: 'export',
		entityType: 'household',
		entityId: actor.householdId,
		contactId: null,
		// The household is meant to see that an export happened; that is the point of it.
		visibility: 'shared',
		summary: describeExport(document.counts),
		createdAt: exportedAt
	});

	return {
		fileName: archiveFileName(snapshot.householdName, exportedAt),
		document,
		mediaPaths: snapshot.mediaPaths
	};
}
