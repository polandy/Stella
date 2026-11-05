import { phrase } from '../../../i18n/phrase';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import { activityRecord, type ActivityOf } from '../activity/activity';
import type { Locale } from '../../../i18n/locales';
import type { HeldGiftsReport } from '../gifts/held-gifts';
import type { MediaStore } from '../media/avatars';
import { DOCUMENT_ENTRY, MEDIA_PREFIX, isSafeMediaPath } from './archive';
import {
	ArchiveFormatError,
	planRestore,
	type RestorePlan,
	type RestoreTarget,
	type RestoreWarning
} from './restore';

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

/** What became of the rows of one table. */
export interface TableOutcome {
	added: number;
	/** Rows left alone because they — or a row in their place — were already here. */
	skipped: number;
	/** Rows left out because something they point at is not here: the person, the entry. */
	withoutParent: number;
}

export type RestoreCounts = Record<string, TableOutcome>;

/**
 * Restoring, from the repository's side. `applyRestore` is one transaction: either the whole
 * plan lands or none of it does, so a failure halfway leaves the household as it was.
 */
export interface RestoreRepository {
	/** What the installation already has, so the plan can be fitted into it. */
	readTarget(householdId: string): Promise<Omit<RestoreTarget, 'householdId' | 'actorId'>>;
	/**
	 * Writes the plan and, in the same transaction, the log line `trail` builds from what was
	 * written — so the household sees every restore that changed anything (ADR-048). The line
	 * needs the counts, hence a function rather than the entry itself.
	 */
	applyRestore(
		plan: RestorePlan,
		trail: (counts: RestoreCounts) => ActivityOf<'archive.restored'>
	): Promise<RestoreCounts>;
}

export interface ImportArchiveDeps {
	restore: RestoreRepository;
	media: Pick<MediaStore, 'read' | 'put'>;
	clock: Clock;
	ids: IdGenerator;
	/**
	 * Makes gift records of the gift notes and gift touchpoints an older archive brings back
	 * (docs/02 §2.25.4) — the same conversion every start runs, so a restore and a start agree.
	 */
	convertHeldGifts: () => Promise<HeldGiftsReport>;
}

/** What the admin is told afterwards. Nothing here is guessed; it is what was written. */
export interface ImportReport {
	/** The household the archive came from — a name, never used to match anything. */
	household: string;
	exportedAt: string | null;
	added: Record<string, number>;
	skipped: Record<string, number>;
	/** `notStored`: images the archive carried that the media store would not take. */
	media: { stored: number; alreadyThere: number; missing: number; notStored: number };
	warnings: RestoreWarning[];
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
			throw new ArchiveFormatError(phrase('archive.error.unusableFileName', { name: entry.name }));
		}
		media.set(key, entry.bytes);
	}

	if (documentText === null) {
		throw new ArchiveFormatError(phrase('archive.error.noDocument', { document: DOCUMENT_ENTRY }));
	}
	return { documentText, media };
}

/**
 * Read an archive into the household: plan it against what is already here, write it in one
 * transaction, put the images that are missing beside it, and leave a trail.
 */
export async function importArchive(
	deps: ImportArchiveDeps,
	actor: { userId: string; householdId: string },
	file: ArchiveFile,
	/** The language of the member running the restore, which its log line is written in. */
	locale: Locale
): Promise<ImportReport> {
	const known = await deps.restore.readTarget(actor.householdId);
	const plan = planRestore(deps, Bun.YAML.parse(file.documentText), {
		householdId: actor.householdId,
		actorId: actor.userId,
		...known
	});

	const counts = await deps.restore.applyRestore(plan, (written) =>
		activityRecord(
			deps,
			{ id: actor.userId, householdId: actor.householdId },
			{
				kind: 'archive.restored',
				people: written.contact?.added ?? 0,
				household: plan.household,
				locale
			}
		)
	);
	// From here on the rows and their log line are in. What follows can only add to them, so a
	// failure is reported rather than thrown — a throw would tell the admin the restore failed.
	// The gift conversion is the exception: it runs at every start, so a failure here is retried
	// there, and it is loud because it is a bug, not a full disk.
	const converted = await deps.convertHeldGifts();
	const added: Record<string, number> = {};
	const skipped: Record<string, number> = {};
	const warnings = [...plan.warnings];
	for (const [table, outcome] of Object.entries(counts)) {
		added[table] = outcome.added;
		skipped[table] = outcome.skipped;
		if (outcome.withoutParent > 0) {
			warnings.push({ code: 'rowsWithoutParent', table, count: outcome.withoutParent });
		}
	}

	// Only after the rows are in: files without rows pointing at them are litter, rows without
	// their file are a broken gallery. An image that is already here is left alone — the same
	// rule the rows follow.
	const media = { stored: 0, alreadyThere: 0, missing: 0, notStored: 0 };
	for (const path of plan.mediaPaths) {
		const bytes = file.media.get(path);
		try {
			if ((await deps.media.read(path)) !== null) {
				media.alreadyThere++;
				continue;
			}
			if (!bytes) {
				media.missing++;
				continue;
			}
			await deps.media.put(path, bytes);
			media.stored++;
		} catch {
			// A full disk or an unwritable directory: the photo row is in and shows as missing,
			// and importing the same archive again once there is room puts the file beside it.
			media.notStored++;
		}
	}
	if (media.missing > 0) {
		warnings.push({ code: 'imagesMissing', count: media.missing });
	}
	if (media.notStored > 0) {
		warnings.push({ code: 'imagesNotStored', count: media.notStored });
	}
	if (converted.giftsWritten > 0) {
		warnings.push({ code: 'giftsConverted', count: converted.giftsWritten });
	}

	return {
		household: plan.household,
		exportedAt: plan.exportedAt,
		added,
		skipped,
		media,
		warnings
	};
}
