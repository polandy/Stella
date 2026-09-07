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

/** Two spaces per level, the way YAML is usually read. */
const YAML_INDENT = 2;

/**
 * The document as the text file the archive carries. Indented block style, not the flow style
 * `Bun.YAML.stringify` writes by default — a 23 KB single line is valid YAML and useless to the
 * person this file is for.
 */
export function serialiseDocument(document: ArchiveDocument): string {
	return Bun.YAML.stringify(document, null, YAML_INDENT);
}

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
 * Whether a media key stays inside the media directory. Keys travel in both directions — out
 * of the database into the archive, and back out of a file somebody uploaded — so anything
 * absolute, empty, or climbing with `..` is rejected rather than sanitised.
 */
export function isSafeMediaPath(path: string): boolean {
	return (
		path.length > 0 &&
		!path.startsWith('/') &&
		!path.includes('\\') &&
		!path.split('/').some((segment) => segment === '..' || segment === '.' || segment === '')
	);
}

/** The entry name for a media file, or a refusal if the key is not one we can carry. */
export function mediaEntryName(path: string): string {
	if (!isSafeMediaPath(path)) throw new UnsafeMediaPathError(path);
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

/** One thing the archive is made of: the document, or one image. */
export type ArchivePlanEntry =
	| { name: typeof DOCUMENT_ENTRY; kind: 'document' }
	| { name: string; kind: 'media'; path: string };

/**
 * Name every entry before a byte is written. The names come from the database, so one that the
 * archive cannot carry has to fail *here* — once the response is on its way the household would
 * get a truncated file that still looks like a backup.
 */
export function planArchive(mediaPaths: readonly string[]): ArchivePlanEntry[] {
	return [
		{ name: DOCUMENT_ENTRY, kind: 'document' },
		...mediaPaths.map((path): ArchivePlanEntry => ({ name: mediaEntryName(path), kind: 'media', path }))
	];
}

/** What assembling the archive needs from the world: the text, the bytes, and somewhere to complain. */
export interface ArchiveSource {
	documentText: string;
	read(path: string): Promise<Uint8Array | null>;
	/** Called for an image the database knows about and the disk does not. */
	onMissing(path: string): void;
}

/**
 * The archive's entries in order, read one at a time so a real photo library is never in memory
 * at once. An image the database names but the disk has lost is skipped and reported: one
 * missing file must not cost the household the other two thousand.
 */
export async function* archiveEntries(
	plan: readonly ArchivePlanEntry[],
	source: ArchiveSource
): AsyncGenerator<{ name: string; bytes: Uint8Array }> {
	for (const entry of plan) {
		if (entry.kind === 'document') {
			yield { name: entry.name, bytes: new TextEncoder().encode(source.documentText) };
			continue;
		}
		const bytes = await source.read(entry.path);
		if (!bytes) {
			source.onMissing(entry.path);
			continue;
		}
		yield { name: entry.name, bytes };
	}
}
