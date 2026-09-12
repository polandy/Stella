import { TranslatableError } from '../../../errors/translatable';
import { phrase, type Phrase } from '../../../i18n/phrase';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import { isSafeMediaPath } from './archive';
import { ARCHIVE_FORMAT, ARCHIVE_VERSION } from './document';

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

/** The kinds of pointer a restore can find dangling. */
export type MentionKind = 'noteMentions' | 'journalMentions' | 'touchpointParticipants';

/**
 * Something the restore left out, as a code the page words (docs/02 §2.19). The plan is a
 * domain module and has no language of its own; the report says *what* happened and the
 * wizard says it in the reader's.
 */
export type RestoreWarning =
	| { code: 'personWithoutName' }
	| { code: 'photoWithoutFile' }
	| { code: 'photoBadPath'; file: string }
	| { code: 'pointedAtMissingPeople'; what: MentionKind }
	| { code: 'contactFieldIncomplete' }
	| { code: 'importantDateIncomplete' }
	| { code: 'noteWithoutText' }
	| { code: 'journalEntryIncomplete' }
	| { code: 'touchpointIncomplete' }
	| { code: 'tagWithoutName' }
	| { code: 'tagsNotInList' }
	| { code: 'circleWithoutName' }
	| { code: 'circleMissingParent'; name: string }
	| { code: 'circleMemberMissing'; name: string }
	| { code: 'relationshipTypeWithoutName' }
	| { code: 'relationshipMissingEnd' }
	| { code: 'relationshipsMissingPeople' }
	| { code: 'relationshipUnknownType' }
	| { code: 'imagesMissing'; count: number };

/** What this installation already has, so the plan can fit itself into it. */
export interface RestoreTarget {
	householdId: string;
	/** The admin running the import; authorship falls back to them. */
	actorId: string;
	/** The members here, so a record restored into its own installation keeps its author. */
	memberIds: readonly string[];
	/** Relationship types that already exist: the built-ins, plus the household's own. */
	relationshipTypeIds: readonly string[];
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

type Row = Record<string, unknown>;

const record = (value: unknown): Row | null =>
	typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Row) : null;

/** A list of sub-records, skipping anything that is not one. */
function records(row: Row, key: string): Row[] {
	const value = row[key];
	if (!Array.isArray(value)) return [];
	return value.map(record).filter((entry): entry is Row => entry !== null);
}

/** A list of ids, skipping anything that is not one. */
function ids(row: Row, key: string): string[] {
	const value = row[key];
	if (!Array.isArray(value)) return [];
	return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

function str(row: Row, key: string): string | null {
	const value = row[key];
	if (typeof value === 'string') return value.length > 0 ? value : null;
	// YAML numbers and booleans in a text field: keep the text rather than lose the value.
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	return null;
}

function int(row: Row, key: string): number | null {
	const value = row[key];
	return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null;
}

const bool = (row: Row, key: string): boolean => row[key] === true;

/** An ISO instant back to the epoch milliseconds the database stores. */
function ms(row: Row, key: string): number | null {
	const value = row[key];
	if (value instanceof Date) return value.getTime();
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	const text = str(row, key);
	if (text === null) return null;
	const parsed = Date.parse(text);
	return Number.isNaN(parsed) ? null : parsed;
}

const visibilityOf = (row: Row): 'shared' | 'private' =>
	str(row, 'visibility') === 'private' ? 'private' : 'shared';

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
 * what the installation already has arrives in `target`, and what comes out is a plan.
 */
export function planRestore(
	deps: RestorePlanDeps,
	parsed: unknown,
	target: RestoreTarget
): RestorePlan {
	const document = readArchiveDocument(parsed);
	const now = deps.clock.now();
	const warnings: RestoreWarning[] = [];
	const warn = (warning: RestoreWarning) => {
		const same = (a: RestoreWarning, b: RestoreWarning) =>
			JSON.stringify(a) === JSON.stringify(b);
		if (!warnings.some((existing) => same(existing, warning))) warnings.push(warning);
	};

	const members = new Set(target.memberIds);
	/** Authorship survives a restore into its own installation; otherwise it is the admin's. */
	const author = (row: Row, key = 'author'): string => {
		const written = str(row, key);
		return written !== null && members.has(written) ? written : target.actorId;
	};

	const stamps = (row: Row) => {
		const createdAt = ms(row, 'created_at') ?? now;
		// `updated_at` is bookkeeping the archive does not carry: the row is new here.
		return { created_at: createdAt, updated_at: createdAt };
	};

	// ── People ────────────────────────────────────────────────────────────
	const contacts: Row[] = [];
	const contactFields: Row[] = [];
	const importantDates: Row[] = [];
	const notes: Row[] = [];
	const noteMentions: Row[] = [];
	const journalEntries: Row[] = [];
	const journalMentions: Row[] = [];
	const interactions: Row[] = [];
	const participants: Row[] = [];
	const photos: Row[] = [];
	const contactTags: Row[] = [];
	const mediaPaths = new Set<string>();

	const people = records(document, 'people');
	const knownPeople = new Set<string>();
	for (const person of people) {
		const id = str(person, 'id');
		const displayName = str(person, 'display_name');
		if (id === null || displayName === null) {
			warn({ code: 'personWithoutName' });
			continue;
		}
		knownPeople.add(id);
		contacts.push({
			id,
			household_id: target.householdId,
			created_by: author(person),
			visibility: visibilityOf(person),
			first_name: str(person, 'first_name'),
			last_name: str(person, 'last_name'),
			nickname: str(person, 'nickname'),
			prefix: str(person, 'prefix'),
			suffix: str(person, 'suffix'),
			former_name: str(person, 'former_name'),
			display_name: displayName,
			gender: str(person, 'gender'),
			pronouns: str(person, 'pronouns'),
			description: str(person, 'description'),
			avatar_photo_id: str(person, 'avatar'),
			birth_date: str(person, 'birth_date'),
			birth_date_precision: str(person, 'birth_date_precision') ?? 'full',
			is_deceased: bool(person, 'deceased') ? 1 : 0,
			death_date: str(person, 'death_date'),
			job_title: str(person, 'job_title'),
			company: str(person, 'company'),
			how_we_met: str(person, 'how_we_met'),
			met_date: str(person, 'met_date'),
			met_place: str(person, 'met_place'),
			archived_at: ms(person, 'archived_at'),
			...stamps(person)
		});
	}

	/** A photo, wherever it hangs: the gallery, or a journal entry. */
	const addPhoto = (row: Row, contactId: string, journalEntryId: string | null) => {
		const file = str(row, 'file');
		const thumb = str(row, 'thumb');
		if (file === null || thumb === null) {
			warn({ code: 'photoWithoutFile' });
			return;
		}
		if (!isSafeMediaPath(file) || !isSafeMediaPath(thumb)) {
			// A path out of the media directory is the one thing in an archive that could reach
			// the rest of the disk. It is refused, not cleaned up.
			warn({ code: 'photoBadPath', file });
			return;
		}
		mediaPaths.add(file);
		mediaPaths.add(thumb);
		photos.push({
			id: str(row, 'id') ?? deps.ids.next(),
			household_id: target.householdId,
			contact_id: contactId,
			journal_entry_id: journalEntryId,
			created_by: author(row),
			visibility: visibilityOf(row),
			file_path: file,
			thumb_path: thumb,
			mime: str(row, 'mime') ?? 'image/jpeg',
			width: int(row, 'width'),
			height: int(row, 'height'),
			size_bytes: int(row, 'bytes'),
			caption: str(row, 'caption'),
			taken_at: str(row, 'taken_at'),
			sort_order: int(row, 'sort_order') ?? 0,
			created_at: ms(row, 'created_at') ?? now
		});
	};

	/** Mentions and participants can only point at people this archive brought along. */
	const knownOnly = (candidates: string[], what: MentionKind): string[] =>
		candidates.filter((id) => {
			if (knownPeople.has(id)) return true;
			warn({ code: 'pointedAtMissingPeople', what });
			return false;
		});

	for (const person of people) {
		const contactId = str(person, 'id');
		if (contactId === null || !knownPeople.has(contactId)) continue;

		records(person, 'fields').forEach((field, index) => {
			const value = str(field, 'value');
			const kind = str(field, 'kind');
			if (value === null || kind === null) {
				warn({ code: 'contactFieldIncomplete' });
				return;
			}
			contactFields.push({
				id: str(field, 'id') ?? deps.ids.next(),
				contact_id: contactId,
				kind,
				label: str(field, 'label'),
				value,
				meta: str(field, 'meta'),
				// Older archives carry no order; the order they are written in is the order.
				sort_order: int(field, 'sort_order') ?? index,
				created_at: now,
				updated_at: now
			});
		});

		for (const date of records(person, 'important_dates')) {
			const day = str(date, 'date');
			const kind = str(date, 'kind');
			if (day === null || kind === null) {
				warn({ code: 'importantDateIncomplete' });
				continue;
			}
			importantDates.push({
				id: str(date, 'id') ?? deps.ids.next(),
				contact_id: contactId,
				kind,
				label: str(date, 'label'),
				date: day,
				recurs_yearly: bool(date, 'recurs_yearly') ? 1 : 0,
				remind: bool(date, 'remind') ? 1 : 0,
				created_at: now,
				updated_at: now
			});
		}

		for (const note of records(person, 'notes')) {
			const body = str(note, 'body');
			if (body === null) {
				warn({ code: 'noteWithoutText' });
				continue;
			}
			const noteId = str(note, 'id') ?? deps.ids.next();
			notes.push({
				id: noteId,
				contact_id: contactId,
				created_by: author(note),
				visibility: visibilityOf(note),
				title: str(note, 'title'),
				body,
				is_pinned: bool(note, 'pinned') ? 1 : 0,
				...stamps(note)
			});
			for (const mentioned of knownOnly(ids(note, 'mentions'), 'noteMentions')) {
				noteMentions.push({ note_id: noteId, contact_id: mentioned });
			}
		}

		for (const entry of records(person, 'journal')) {
			const body = str(entry, 'body');
			const day = str(entry, 'date');
			if (body === null || day === null) {
				warn({ code: 'journalEntryIncomplete' });
				continue;
			}
			const entryId = str(entry, 'id') ?? deps.ids.next();
			journalEntries.push({
				id: entryId,
				contact_id: contactId,
				created_by: author(entry),
				visibility: visibilityOf(entry),
				entry_date: day,
				title: str(entry, 'title'),
				body,
				...stamps(entry)
			});
			for (const mentioned of knownOnly(ids(entry, 'mentions'), 'journalMentions')) {
				journalMentions.push({ journal_entry_id: entryId, contact_id: mentioned });
			}
			for (const image of records(entry, 'photos')) addPhoto(image, contactId, entryId);
		}

		for (const touch of records(person, 'interactions')) {
			const kind = str(touch, 'kind');
			const happenedAt = str(touch, 'happened_at');
			if (kind === null || happenedAt === null) {
				warn({ code: 'touchpointIncomplete' });
				continue;
			}
			const interactionId = str(touch, 'id') ?? deps.ids.next();
			interactions.push({
				id: interactionId,
				contact_id: contactId,
				created_by: author(touch),
				visibility: visibilityOf(touch),
				kind,
				title: str(touch, 'title'),
				description: str(touch, 'description'),
				happened_at: happenedAt,
				...stamps(touch)
			});
			for (const other of knownOnly(ids(touch, 'participants'), 'touchpointParticipants')) {
				participants.push({ interaction_id: interactionId, contact_id: other });
			}
		}

		for (const image of records(person, 'photos')) addPhoto(image, contactId, null);
	}

	// ── Tags ──────────────────────────────────────────────────────────────
	// A tag is unique by name within a household, so one the household already has is reused
	// and the archive's id is re-pointed at it — otherwise every link would hit that constraint.
	const tags: Row[] = [];
	const tagIdByArchiveId = new Map<string, string>();
	const tagIdByName = new Map(target.tags.map((tag) => [tag.name, tag.id]));
	for (const tag of records(document, 'tags')) {
		const id = str(tag, 'id');
		const name = str(tag, 'name');
		if (id === null || name === null) {
			warn({ code: 'tagWithoutName' });
			continue;
		}
		const existing = tagIdByName.get(name);
		if (existing !== undefined) {
			tagIdByArchiveId.set(id, existing);
			continue;
		}
		tagIdByArchiveId.set(id, id);
		tagIdByName.set(name, id);
		tags.push({
			id,
			household_id: target.householdId,
			name,
			color: str(tag, 'color') ?? 'lavender',
			...stamps(tag)
		});
	}

	for (const person of people) {
		const contactId = str(person, 'id');
		if (contactId === null || !knownPeople.has(contactId)) continue;
		for (const archiveTagId of ids(person, 'tags')) {
			const tagId = tagIdByArchiveId.get(archiveTagId);
			if (tagId === undefined) {
				warn({ code: 'tagsNotInList' });
				continue;
			}
			contactTags.push({ contact_id: contactId, tag_id: tagId });
		}
	}

	// ── Circles ───────────────────────────────────────────────────────────
	const circles: Row[] = [];
	const memberships: Row[] = [];
	const circleRows = records(document, 'circles');
	const knownCircles = new Set(
		circleRows.map((circle) => str(circle, 'id')).filter((id): id is string => id !== null)
	);
	for (const circle of circleRows) {
		const id = str(circle, 'id');
		const name = str(circle, 'name');
		if (id === null || name === null) {
			warn({ code: 'circleWithoutName' });
			continue;
		}
		const parent = str(circle, 'parent');
		if (parent !== null && !knownCircles.has(parent)) {
			warn({ code: 'circleMissingParent', name });
		}
		circles.push({
			id,
			household_id: target.householdId,
			created_by: author(circle),
			visibility: visibilityOf(circle),
			name,
			description: str(circle, 'description'),
			kind: str(circle, 'kind') ?? 'other',
			color: str(circle, 'color') ?? 'blue',
			parent_circle_id: parent !== null && knownCircles.has(parent) ? parent : null,
			start_date: str(circle, 'start'),
			end_date: str(circle, 'end'),
			archived_at: ms(circle, 'archived_at'),
			...stamps(circle)
		});

		for (const member of records(circle, 'members')) {
			const person = str(member, 'person');
			if (person === null || !knownPeople.has(person)) {
				warn({ code: 'circleMemberMissing', name });
				continue;
			}
			memberships.push({
				id: str(member, 'id') ?? deps.ids.next(),
				circle_id: id,
				contact_id: person,
				role: str(member, 'role'),
				start_date: str(member, 'since'),
				end_date: str(member, 'until'),
				note: str(member, 'note'),
				created_by: author(member),
				...stamps(member)
			});
		}
	}

	// ── Relationship types and relationships ──────────────────────────────
	const relationshipTypes: Row[] = [];
	const knownTypes = new Set(target.relationshipTypeIds);
	records(document, 'relationship_types').forEach((type, index) => {
		const id = str(type, 'id');
		const key = str(type, 'key');
		const forward = str(type, 'forward_label');
		if (id === null || key === null || forward === null) {
			warn({ code: 'relationshipTypeWithoutName' });
			return;
		}
		knownTypes.add(id);
		relationshipTypes.push({
			id,
			household_id: target.householdId,
			key,
			forward_label: forward,
			reverse_label: str(type, 'reverse_label') ?? forward,
			category: str(type, 'category') ?? 'other',
			symmetric: bool(type, 'symmetric') ? 1 : 0,
			sort_order: int(type, 'sort_order') ?? index
		});
	});

	const relationships: Row[] = [];
	for (const link of records(document, 'relationships')) {
		const from = str(link, 'from');
		const to = str(link, 'to');
		const type = str(link, 'type');
		if (from === null || to === null || type === null) {
			warn({ code: 'relationshipMissingEnd' });
			continue;
		}
		if (!knownPeople.has(from) || !knownPeople.has(to)) {
			warn({ code: 'relationshipsMissingPeople' });
			continue;
		}
		if (!knownTypes.has(type)) {
			warn({ code: 'relationshipUnknownType' });
			continue;
		}
		relationships.push({
			id: str(link, 'id') ?? deps.ids.next(),
			household_id: target.householdId,
			from_contact_id: from,
			to_contact_id: to,
			type_id: type,
			note: str(link, 'description'),
			since_date: str(link, 'since'),
			status: str(link, 'status'),
			created_by: author(link),
			...stamps(link)
		});
	}

	// ── The trail ─────────────────────────────────────────────────────────
	const activity: Row[] = [];
	for (const entry of records(document, 'activity')) {
		const action = str(entry, 'action');
		const summary = str(entry, 'summary');
		if (action === null || summary === null) continue;
		activity.push({
			id: str(entry, 'id') ?? deps.ids.next(),
			household_id: target.householdId,
			actor_id: author(entry, 'actor'),
			action,
			entity_type: str(entry, 'entity_type') ?? 'contact',
			entity_id: str(entry, 'entity_id') ?? '',
			contact_id: str(entry, 'person'),
			visibility: visibilityOf(entry),
			summary,
			created_at: ms(entry, 'created_at') ?? now
		});
	}

	return {
		householdId: target.householdId,
		household: str(document, 'household') ?? 'a household',
		exportedAt: str(document, 'exported_at'),
		// Insert order: whatever a row points at comes before it.
		tables: [
			{ table: 'relationship_type', rows: relationshipTypes },
			{ table: 'contact', rows: contacts },
			{ table: 'contact_field', rows: contactFields },
			{ table: 'important_date', rows: importantDates },
			{ table: 'tag', rows: tags },
			{ table: 'contact_tag', rows: contactTags },
			{ table: 'note', rows: notes },
			{ table: 'note_mention', rows: noteMentions },
			{ table: 'journal_entry', rows: journalEntries },
			{ table: 'journal_mention', rows: journalMentions },
			{ table: 'interaction', rows: interactions },
			{ table: 'interaction_participant', rows: participants },
			{ table: 'photo', rows: photos },
			{ table: 'circle', rows: circles },
			{ table: 'circle_membership', rows: memberships },
			{ table: 'relationship', rows: relationships },
			{ table: 'activity_log', rows: activity }
		],
		mediaPaths: [...mediaPaths],
		warnings
	};
}
