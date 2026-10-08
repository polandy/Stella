import type { Visibility, Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import type { Locale } from '../../../i18n/locales';
import {
	LAST_NAMES_ENTITY,
	lastNamesFacts,
	RENAME_ENTITY,
	renameFacts
} from '../../../stream/notices';

/*
 * The household's activity log (docs/03 §activity_log). The stream is otherwise a query over
 * the tables that still exist (docs/02 §2.11) — which is why only what leaves nothing else to
 * query is logged: a deletion, a merge, an export or import, a name changed in passing.
 *
 * The other contexts report what happened as an `ActivityEvent` — data, no wording — and hand
 * it to the write it belongs to, so the adapter puts the row in the same transaction as the
 * change (docs/04 ADR-048). How an event becomes a row, and what its line says, is decided
 * here and nowhere else.
 */

/** What happened to the entity, as the log row stores it. */
export type ActivityAction =
	'create' | 'update' | 'delete' | 'archive' | 'merge' | 'export' | 'import';

/** A log row as it is written. */
export interface NewActivityEntry {
	id: string;
	householdId: string;
	actorId: string;
	action: ActivityAction;
	entityType: string;
	/** Polymorphic and without a foreign key: the entity it names is usually gone. */
	entityId: string;
	contactId: string | null;
	/** Mirrors the affected record's visibility at write time, so the log leaks nothing. */
	visibility: Visibility;
	/** Precomputed, because the record it describes cannot be read back. */
	summary: string;
	createdAt: number;
}

/** The log entity a link to an Immich person is written under. */
export const IMMICH_LINK_ENTITY = 'immich_link';

/** The person a link to Immich was made or removed for, as visible as they are. */
interface LinkedPerson {
	contactId: string;
	displayName: string;
	visibility: Visibility;
}

/** Something the household should be able to see happened, as the context that did it says. */
export type ActivityEvent = PlainActivityEvent | LocalizedActivityEvent;

/** An event whose line is the same in every language, or is said at read time. */
export type PlainActivityEvent =
	| {
			kind: 'contact.deleted';
			contactId: string;
			/** Kept because the row it names is not. */
			displayName: string;
			visibility: Visibility;
	  }
	| {
			kind: 'contact.merged';
			keepId: string;
			mergedAwayId: string;
			keep: string;
			mergedAway: string;
			/** The survivor's: the record merged away no longer exists to be private. */
			visibility: Visibility;
	  }
	| { kind: 'contact.renamed'; contactId: string; from: string; to: string; visibility: Visibility }
	| {
			kind: 'lastNames.given';
			/** One of the people the batch named, so the row has an entity to point at. */
			firstContactId: string;
			/** The names given, joined for the line. */
			lastNames: string;
			count: number;
			/** No more visible than the least visible person it is about. */
			visibility: Visibility;
	  }
	| ({ kind: 'immich.linked' } & LinkedPerson)
	| ({ kind: 'immich.unlinked' } & LinkedPerson)
	| { kind: 'archive.exported'; people: number };

/**
 * An event whose line is written in the language of the member who caused it, because the
 * household keeps it as data (docs/02 §2.19).
 */
export type LocalizedActivityEvent =
	| { kind: 'archive.restored'; people: number; household: string; locale: Locale }
	| {
			kind: 'people.imported';
			people: number;
			source: string;
			/** Mirrors what was imported: a private batch is logged for its author alone. */
			visibility: Visibility;
			locale: Locale;
	  };

/** An event with who, where and when — what a port that logs is handed. */
export interface ActivityRecord<E extends ActivityEvent = ActivityEvent> {
	id: string;
	householdId: string;
	actorId: string;
	createdAt: number;
	event: E;
}

/** The record of one kind of event, for a port that logs exactly that. */
export type ActivityOf<K extends ActivityEvent['kind']> = ActivityRecord<
	Extract<ActivityEvent, { kind: K }>
>;

/**
 * The lines of the localized events — a port the composition root fills from the catalogues
 * (docs/02 §2.19), so the wording is decided here without the domain loading a translator.
 */
export interface ActivityWording {
	/** "restored 12 people from an archive of Pollari". */
	restored(locale: Locale, people: number, household: string): string;
	/** "imported 12 people from kindergarten-2023". */
	imported(locale: Locale, people: number, source: string): string;
}

/** Stamp an event with the member who caused it, a fresh id and the moment (`at`, or now). */
export function activityRecord<E extends ActivityEvent>(
	deps: { ids: IdGenerator; clock: Clock },
	by: Viewer,
	event: E,
	at: number = deps.clock.now()
): ActivityRecord<E> {
	return { id: deps.ids.next(), householdId: by.householdId, actorId: by.id, createdAt: at, event };
}

type Described = Omit<NewActivityEntry, 'id' | 'householdId' | 'actorId' | 'createdAt'>;

function plainRow(event: PlainActivityEvent, householdId: string): Described {
	switch (event.kind) {
		case 'contact.deleted':
			return {
				action: 'delete',
				entityType: 'contact',
				entityId: event.contactId,
				// The person this was "about" is the one being deleted, so there is nothing to link to.
				contactId: null,
				visibility: event.visibility,
				summary: `removed ${event.displayName}`
			};
		case 'contact.merged':
			return {
				action: 'merge',
				entityType: 'contact',
				entityId: event.mergedAwayId,
				// The survivor is what this is "about", and unlike a deletion they still have a page.
				contactId: event.keepId,
				visibility: event.visibility,
				summary: `merged ${event.mergedAway} into ${event.keep}`
			};
		case 'contact.renamed':
			return {
				action: 'update',
				entityType: RENAME_ENTITY,
				entityId: event.contactId,
				contactId: event.contactId,
				visibility: event.visibility,
				// Facts, said at read time in each reader's language (docs/02 §2.11).
				summary: renameFacts(event.from, event.to)
			};
		case 'lastNames.given':
			return {
				action: 'update',
				entityType: LAST_NAMES_ENTITY,
				entityId: event.firstContactId,
				contactId: null,
				visibility: event.visibility,
				summary: lastNamesFacts(event.lastNames, event.count)
			};
		case 'immich.linked':
		case 'immich.unlinked':
			return {
				// An update to the person, not a record of its own: the stream shows deletions, and
				// a link removed is not a person removed (docs/02 §2.11).
				action: 'update',
				entityType: IMMICH_LINK_ENTITY,
				entityId: event.contactId,
				contactId: event.contactId,
				// Mirrors the contact: the link of a private contact is as private as the contact.
				visibility: event.visibility,
				summary:
					event.kind === 'immich.linked'
						? `linked ${event.displayName} to Immich`
						: `unlinked ${event.displayName} from Immich`
			};
		case 'archive.exported':
			return {
				action: 'export',
				entityType: 'household',
				entityId: householdId,
				contactId: null,
				// The household is meant to see that an export happened; that is the point of it.
				visibility: 'shared',
				summary: `exported the household archive (${event.people} ${event.people === 1 ? 'person' : 'people'})`
			};
	}
}

function localizedRow(
	event: LocalizedActivityEvent,
	householdId: string,
	wording: ActivityWording
): Described {
	switch (event.kind) {
		case 'archive.restored':
			return {
				action: 'import',
				entityType: 'household',
				entityId: householdId,
				contactId: null,
				// The household is meant to see that an import happened; that is the point of it.
				visibility: 'shared',
				summary: wording.restored(event.locale, event.people, event.household)
			};
		case 'people.imported':
			return {
				action: 'import',
				entityType: 'household',
				entityId: householdId,
				contactId: null,
				visibility: event.visibility,
				summary: wording.imported(event.locale, event.people, event.source)
			};
	}
}

const stampOf = ({ id, householdId, actorId, createdAt }: ActivityRecord) => ({
	id,
	householdId,
	actorId,
	createdAt
});

/** The row an event is logged as. */
export function activityEntry(record: ActivityRecord<PlainActivityEvent>): NewActivityEntry {
	return { ...stampOf(record), ...plainRow(record.event, record.householdId) };
}

/** The row a localized event is logged as, its line in the language the event carries. */
export function localizedActivityEntry(
	record: ActivityRecord<LocalizedActivityEvent>,
	wording: ActivityWording
): NewActivityEntry {
	return { ...stampOf(record), ...localizedRow(record.event, record.householdId, wording) };
}
