import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import type { NewActivityEntry } from '../activity/activity';
import type { MediaStore } from '../media/avatars';
import { DOCUMENT_ENTRY, MEDIA_PREFIX, isSafeMediaPath } from './archive';
import { ArchiveFormatError, planRestore, type RestorePlan, type RestoreTarget } from './restore';

/*
 * Reading an archive back into the household (docs/02 §2.15) — the other half of the export.
 *
 * What it is: a way to get a household's own data back after a mishap, and the way to move a
 * household from one Stella to another. What it is not: a merge tool. It **adds what is
 * missing and never overwrites what is here**, which makes importing the same archive twice a
 * no-op and means no import can quietly rewrite a note somebody has since edited (docs/04
 * §4.9).
 *
 * Admin-only, like the export, because an archive carries every member's private records; and
 * like the export it writes itself into the activity log, so the household sees it happened.
 */

/** An archive taken apart: the one document, and the image files that came with it. */
export interface ArchiveFile {
	documentText: string;
	/** Media keyed the way the database names them, i.e. without the `media/` prefix. */
	media: Map<string, Uint8Array>;
}

/** How many rows of one table were written, and how many were already here. */
export interface TableOutcome {
	added: number;
	skipped: number;
}

export type RestoreCounts = Record<string, TableOutcome>;

/**
 * Restoring, from the repository's side. `applyRestore` is one transaction: either the whole
 * plan lands or none of it does, so a failure halfway leaves the household as it was.
 */
export interface RestoreRepository {
	/** What the installation already has, so the plan can be fitted into it. */
	readTarget(householdId: string): Promise<Omit<RestoreTarget, 'householdId' | 'actorId'>>;
	applyRestore(plan: RestorePlan): Promise<RestoreCounts>;
	/** Records that an import happened, so the household can see it in the stream. */
	recordImport(entry: NewActivityEntry): Promise<void>;
}

export interface ImportArchiveDeps {
	restore: RestoreRepository;
	media: MediaStore;
	clock: Clock;
	ids: IdGenerator;
}

/** What the admin is told afterwards. Nothing here is guessed; it is what was written. */
export interface ImportReport {
	/** The household the archive came from — a name, never used to match anything. */
	household: string;
	exportedAt: string | null;
	added: Record<string, number>;
	skipped: Record<string, number>;
	media: { stored: number; alreadyThere: number; missing: number };
	warnings: string[];
}

/** One file in an archive, however it was unpacked. */
interface ArchiveEntry {
	name: string;
	bytes: Uint8Array;
}

/**
 * The document and the images, out of the entries of an unpacked archive. Anything else in the
 * file is ignored — a household may well have added a README next to the export — but a media
 * path that does not stay inside the media directory is refused outright rather than cleaned
 * up, because it is the one thing in an uploaded archive that could reach the rest of the disk.
 */
export function splitArchive(entries: readonly ArchiveEntry[]): ArchiveFile {
	let documentText: string | null = null;
	const media = new Map<string, Uint8Array>();

	for (const entry of entries) {
		if (entry.name === DOCUMENT_ENTRY) {
			documentText = new TextDecoder().decode(entry.bytes);
			continue;
		}
		if (!entry.name.startsWith(MEDIA_PREFIX)) continue;
		const key = entry.name.slice(MEDIA_PREFIX.length);
		if (!isSafeMediaPath(key)) {
			throw new ArchiveFormatError(`This archive contains an unusable file name: “${entry.name}”.`);
		}
		media.set(key, entry.bytes);
	}

	if (documentText === null) {
		throw new ArchiveFormatError(
			`This archive has no ${DOCUMENT_ENTRY} in it, so it is not a Stella archive.`
		);
	}
	return { documentText, media };
}

/** What the log says about an import; there is no entity left over to name. */
export function describeImport(added: Record<string, number>, household: string): string {
	const people = added.contact ?? 0;
	const what = people === 1 ? '1 person' : `${people} people`;
	return `restored ${what} from an archive of ${household}`;
}

/**
 * Read an archive into the household: plan it against what is already here, write it in one
 * transaction, put the images that are missing beside it, and leave a trail.
 */
export async function importArchive(
	deps: ImportArchiveDeps,
	actor: { userId: string; householdId: string },
	file: ArchiveFile
): Promise<ImportReport> {
	const known = await deps.restore.readTarget(actor.householdId);
	const plan = planRestore(deps, Bun.YAML.parse(file.documentText), {
		householdId: actor.householdId,
		actorId: actor.userId,
		...known
	});

	const counts = await deps.restore.applyRestore(plan);
	const added: Record<string, number> = {};
	const skipped: Record<string, number> = {};
	for (const [table, outcome] of Object.entries(counts)) {
		added[table] = outcome.added;
		skipped[table] = outcome.skipped;
	}

	// Only after the rows are in: files without rows pointing at them are litter, rows without
	// their file are a broken gallery. An image that is already here is left alone — the same
	// rule the rows follow.
	const media = { stored: 0, alreadyThere: 0, missing: 0 };
	const warnings = [...plan.warnings];
	for (const path of plan.mediaPaths) {
		if ((await deps.media.read(path)) !== null) {
			media.alreadyThere++;
			continue;
		}
		const bytes = file.media.get(path);
		if (!bytes) {
			media.missing++;
			continue;
		}
		await deps.media.put(path, bytes);
		media.stored++;
	}
	if (media.missing > 0) {
		warnings.push(
			`${media.missing} image${media.missing === 1 ? '' : 's'} named in the document ${media.missing === 1 ? 'was' : 'were'} not in the archive; those photos will show as missing.`
		);
	}

	await deps.restore.recordImport({
		id: deps.ids.next(),
		householdId: actor.householdId,
		actorId: actor.userId,
		action: 'import',
		entityType: 'household',
		entityId: actor.householdId,
		contactId: null,
		// The household is meant to see that an import happened; that is the point of it.
		visibility: 'shared',
		summary: describeImport(added, plan.household),
		createdAt: deps.clock.now()
	});

	return {
		household: plan.household,
		exportedAt: plan.exportedAt,
		added,
		skipped,
		media,
		warnings
	};
}
