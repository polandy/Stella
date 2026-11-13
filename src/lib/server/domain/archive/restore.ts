import { TranslatableError } from '../../../i18n/translatable';
import { phrase, type Phrase } from '../../../i18n/phrase';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import { planAnswers } from './restore-answers';
import { ARCHIVE_FORMAT, ARCHIVE_VERSION } from './document';
import type { RestoreContext, RestoreWarning } from './restore-context';
import { int, ms, record, records, str, visibilityOf, type Row } from './restore-fields';
import { planCircles, planHomes, planTags } from './restore-groups';
import { planImmichIgnores, planPeople } from './restore-people';
import { photoPlan } from './restore-photos';
import { planPersonRecords } from './restore-records';
import { planRelationships } from './restore-relationships';

/*
 * Reading an archive back (docs/02 §2.15): the document turned into rows this installation can
 * hold. The inverse of `document.ts`, and pure in the same way — a parsed document in, a plan
 * out, nothing written.
 *
 * Three rules shape everything here:
 *
 * - **The id is the key.** Every record keeps the id it was exported with, so a record that is
 *   already here is recognised as the same one and left alone rather than duplicated. That is
 *   what makes importing the same archive twice a no-op.
 * - **Nothing is overwritten.** The plan only ever adds; deciding that a file on disk is more
 *   right than the household's live data is not a call an importer gets to make.
 * - **A reference that cannot be met is dropped, loudly.** An archive is a file a user hands
 *   us: a mention of a person who is not in it, a relationship of a type this installation has
 *   never heard of, a media path climbing out of the media directory. Each one is left out and
 *   named in the report, because a failed import of 2000 people over one bad row is worse, and
 *   a silent one is worse still.
 */

/** A file that is not a Stella archive, or one this reader cannot make sense of. */
export class ArchiveFormatError extends TranslatableError {
	constructor(message: Phrase) {
		super(message, 'ArchiveFormatError');
	}
}

/**
 * An id in the archive that this server already holds for another household. Restoring it
 * would hang the archive's records off somebody else's rows, so the import stops instead.
 */
export class ForeignHouseholdError extends TranslatableError {
	constructor(table: string, id: string) {
		super(phrase('archive.error.foreignHousehold', { table, id }), 'ForeignHouseholdError');
	}
}

/** An archive written by a newer Stella than this one. */
export class ArchiveVersionError extends TranslatableError {
	constructor(readonly fileVersion: number) {
		super(
			phrase('archive.error.newerVersion', { fileVersion, reads: ARCHIVE_VERSION }),
			'ArchiveVersionError'
		);
	}
}

/** What this installation already has, so the plan can fit itself into it. */
export interface RestoreTarget {
	householdId: string;
	/** The admin running the import; authorship falls back to them. */
	actorId: string;
	/** The members here, so a record restored into its own installation keeps its author. */
	memberIds: readonly string[];
	/** Relationship types that already exist: the built-ins, plus the household's own. */
	relationshipTypeIds: readonly string[];
	/** Those of them that are symmetric, which decides the order a link's ends are stored in. */
	symmetricTypeIds: readonly string[];
	/** Tags the household already has. A tag is unique by name, so it is matched by name. */
	tags: readonly { id: string; name: string }[];
}

/** One table's rows, ready to be inserted. */
export interface PlannedTable {
	table: string;
	rows: Record<string, unknown>[];
}

export interface RestorePlan {
	/** The household the rows are being written into. */
	householdId: string;
	/** The household the archive came from, for the report — never for matching anything. */
	household: string;
	exportedAt: string | null;
	/** Tables in insert order: whatever a row points at comes before it. */
	tables: PlannedTable[];
	/** The media files the plan's photos need, as relative keys. */
	mediaPaths: string[];
	/** What was left out, in words the admin can act on. */
	warnings: RestoreWarning[];
}

export interface RestorePlanDeps {
	ids: IdGenerator;
	clock: Clock;
}

/**
 * The document as it came out of the YAML parser, checked far enough to be worth reading.
 * A file that is not ours, or is from a newer Stella, is refused here and never half-imported.
 */
export function readArchiveDocument(parsed: unknown): Row {
	const document = record(parsed);
	if (!document) throw new ArchiveFormatError(phrase('archive.error.notAnArchive'));
	if (str(document, 'format') !== ARCHIVE_FORMAT) {
		throw new ArchiveFormatError(phrase('archive.error.noFormatLine'));
	}
	const version = int(document, 'version');
	if (version === null) {
		throw new ArchiveFormatError(phrase('archive.error.noVersion'));
	}
	if (version > ARCHIVE_VERSION) throw new ArchiveVersionError(version);
	return document;
}

/**
 * Turn a parsed archive document into the rows to insert. Nothing here touches the database:
 * what the installation already has arrives in `target`, and what comes out is a plan. Each
 * table group is planned by its own `restore-*.ts` module, in the order their warnings read.
 */
export function planRestore(
	deps: RestorePlanDeps,
	parsed: unknown,
	target: RestoreTarget
): RestorePlan {
	const document = readArchiveDocument(parsed);
	const now = deps.clock.now();
	const warnings: RestoreWarning[] = [];
	const members = new Set(target.memberIds);
	const ctx: RestoreContext = {
		householdId: target.householdId,
		ids: deps.ids,
		now,
		members,
		author: (row, key = 'author') => {
			const written = str(row, key);
			return written !== null && members.has(written) ? written : target.actorId;
		},
		stamps: (row) => {
			const createdAt = ms(row, 'created_at') ?? now;
			// `updated_at` is bookkeeping the archive does not carry: the row is new here.
			return { created_at: createdAt, updated_at: createdAt };
		},
		warn: (warning) => {
			const same = (a: RestoreWarning, b: RestoreWarning) =>
				JSON.stringify(a) === JSON.stringify(b);
			if (!warnings.some((existing) => same(existing, warning))) warnings.push(warning);
		}
	};

	const people = records(document, 'people');
	const photos = photoPlan(ctx);
	const { contacts, immichLinks, knownPeople } = planPeople(people, ctx);
	const personRecords = planPersonRecords(people, knownPeople, photos, ctx);
	const { tags, contactTags } = planTags(document, people, knownPeople, target.tags, ctx);
	const { circles, memberships } = planCircles(document, knownPeople, photos, ctx);
	const { homes, homeMembers } = planHomes(document, knownPeople, ctx);
	const { relationshipTypes, relationships } = planRelationships(
		document,
		knownPeople,
		target,
		ctx
	);
	const activity = planTrail(document, ctx);
	const immichIgnores = planImmichIgnores(people, knownPeople, ctx);
	const answers = planAnswers(document, { ...ctx, knownPeople });
	const kept = photos.finish();

	return {
		householdId: target.householdId,
		household: str(document, 'household') ?? 'a household',
		exportedAt: str(document, 'exported_at'),
		// Insert order: whatever a row points at comes before it.
		tables: [
			{ table: 'relationship_type', rows: relationshipTypes },
			{ table: 'contact', rows: contacts },
			{ table: 'contact_field', rows: personRecords.contactFields },
			{ table: 'home', rows: homes },
			{ table: 'home_member', rows: homeMembers },
			{ table: 'important_date', rows: personRecords.importantDates },
			{ table: 'tag', rows: tags },
			{ table: 'contact_tag', rows: contactTags },
			{ table: 'immich_link', rows: immichLinks },
			{ table: 'immich_ignore', rows: immichIgnores },
			{ table: 'note', rows: personRecords.notes },
			{ table: 'note_mention', rows: personRecords.noteMentions },
			{ table: 'journal_entry', rows: personRecords.journalEntries },
			{ table: 'journal_subject', rows: personRecords.journalSubjects },
			{ table: 'journal_mention', rows: personRecords.journalMentions },
			{ table: 'journal_immich_photo', rows: personRecords.journalImmichPhotos },
			{ table: 'interaction', rows: personRecords.interactions },
			{ table: 'interaction_participant', rows: personRecords.participants },
			{ table: 'gift', rows: personRecords.gifts },
			{ table: 'todo', rows: personRecords.todos },
			{ table: 'photo', rows: kept.photos },
			{ table: 'circle', rows: circles },
			{ table: 'circle_membership', rows: memberships },
			{ table: 'relationship', rows: relationships },
			{ table: 'activity_log', rows: activity },
			{ table: 'immich_name_ignore', rows: answers.immichNameIgnores },
			{ table: 'contact_source_link', rows: answers.sourceLinks },
			{ table: 'suggestion_dismissal', rows: answers.dismissals },
			{ table: 'command_receipt', rows: answers.receipts }
		],
		mediaPaths: kept.mediaPaths,
		warnings
	};
}

/** The activity trail, kept where it says what was done; a line without that is dropped. */
function planTrail(document: Row, ctx: RestoreContext): Row[] {
	const activity: Row[] = [];
	for (const entry of records(document, 'activity')) {
		const action = str(entry, 'action');
		const summary = str(entry, 'summary');
		if (action === null || summary === null) continue;
		activity.push({
			id: str(entry, 'id') ?? ctx.ids.next(),
			household_id: ctx.householdId,
			actor_id: ctx.author(entry, 'actor'),
			action,
			entity_type: str(entry, 'entity_type') ?? 'contact',
			entity_id: str(entry, 'entity_id') ?? '',
			contact_id: str(entry, 'person'),
			visibility: visibilityOf(entry),
			summary,
			created_at: ms(entry, 'created_at') ?? ctx.now
		});
	}
	return activity;
}
