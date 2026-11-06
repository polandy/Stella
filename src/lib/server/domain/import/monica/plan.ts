import type { Locale } from '../../../../i18n/locales';
import type { Visibility } from '../../../access/visibility';
import type { NewContactField } from '../../contact-fields/contact-fields';
import type { NewContact } from '../../contacts/contacts';
import type { NewInteraction } from '../../interactions/interactions';
import type { NewNote } from '../../notes/notes';
import type { Gift } from '../../gifts/gifts';
import type { Todo } from '../../todos/todos';
import type { RelationshipCategory } from '../../../../relationships/categories';
import type { NewRelationship } from '../../relationships/relationships';
import type { NewTag } from '../../tags/tags';
import type { MonicaId, SourceExport } from './monica-export';
import { sourcePrefix } from '../source';
import type { KnownLabel } from '../../../../import-match/card';
import { planContacts, planPhotos, planTags } from './plan-contacts';
import { planContactFields } from './plan-fields';
import { planPersonRecords } from './plan-records';
import { planRelationships } from './plan-relationships';

/*
 * The Monica → Stella mapping (docs/02 §2.16; the table is docs/monica-mapping.md). Pure:
 * given the typed export it decides every row the import will write and reports what it
 * approximated or left out; each table group is planned by its own `plan-*.ts` module. Ids are stable *source ids* (`monica:contact:12`), so importing
 * the same export twice cannot duplicate — the adapter inserts with "do nothing on conflict".
 */

export interface ImportOptions {
	householdId: string;
	userId: string;
	/** Visibility every imported record gets (the wizard's choice). */
	visibility: Visibility;
	/** Import time, stamped as createdAt/updatedAt on every row. */
	now: number;
	/**
	 * The words the importer *writes into the data* — a gift note's title, the day a life
	 * event happened. Unlike the report, this is content the household keeps, so it is
	 * written in the language of the member running the import (docs/02 §2.19).
	 */
	wording: ImportWording;
	/** The importing member's language: a nickname in a shown name takes its quote marks. */
	locale: Locale;
}

/** The handful of phrases the plan puts into imported records. */
export interface ImportWording {
	gift: string;
	lifeEvent: string;
	pet: string;
	/** A Monica activity kind, as the note's trailing note. */
	monicaActivity: (kind: string) => string;
	/** "Through Peter", when Monica only knows who introduced them. */
	metThrough: (name: string) => string;
	/** "…, met at the lake (through Peter)". */
	metThroughInfo: (info: string, name: string) => string;
	/** One day, spelled out. */
	day: (isoDay: string) => string;
	/** A label every address book writes the same way (*Home*), for a field the review adds. */
	fieldLabel: (label: KnownLabel) => string;
}

/** A contact row as the import writes it — the profile fields Stella's create form lacks included. */
export interface ImportedContact extends NewContact {
	jobTitle: string | null;
	company: string | null;
	isDeceased: boolean;
	deathDate: string | null;
}

/** A custom relationship type the import creates because Stella has no built-in equivalent. */
export interface ImportedRelationshipType {
	id: string;
	householdId: string;
	key: string;
	forwardLabel: string;
	reverseLabel: string;
	category: RelationshipCategory;
	symmetric: boolean;
}

/** A photo to copy from Monica's storage into Stella's media store. */
export interface ImportedPhoto {
	id: string;
	contactId: string;
	/** Relative to Monica's public storage directory (`storage/app/public`). */
	sourcePath: string;
	mime: string;
	sizeBytes: number | null;
	/** Whether the contact used this photo as their avatar. */
	isAvatar: boolean;
	/**
	 * The picture itself when the export carried it (JSON), so the browser can fetch it back
	 * and downscale it there — the server has no image library (docs/04 §4.9). Null for a
	 * dump, where the admin points at Monica's storage folder instead.
	 */
	dataUrl: string | null;
}

export interface ImportCounts {
	contacts: number;
	relationships: number;
	relationshipTypes: number;
	contactFields: number;
	notes: number;
	gifts: number;
	todos: number;
	interactions: number;
	tags: number;
	photos: number;
}

/** What kind of record was left out; the wizard names it in the reader's language. */
export type SkippedKind =
	| 'contact'
	| 'relationship'
	| 'contactField'
	| 'address'
	| 'note'
	| 'gift'
	| 'task'
	| 'lifeEvent'
	| 'pet'
	| 'activity'
	| 'photo'
	| 'journalEntry'
	| 'reminder';

/** Why it was left out. */
export type SkippedReason =
	| 'deletedInMonica'
	| 'refersToDeletedContact'
	| 'linksPersonToThemselves'
	| 'belongsToDeletedContact'
	| 'empty'
	| 'linkedToNoPerson'
	| 'linkedOnlyToDeletedContacts'
	| 'attachedToNoPerson'
	| 'notAttachedToPerson'
	| 'remindersDerived';

export interface SkippedRecords {
	what: SkippedKind;
	count: number;
	why: SkippedReason;
	/** Whatever identifies the records, verbatim from the export; not translated. */
	detail?: string;
}

/** Something worth saying about the export, as a code the wizard words (docs/02 §2.19). */
export type ImportWarning =
	| { code: 'customType'; name: string }
	| { code: 'manyUsers'; count: number }
	| { code: 'vcardPeopleOnly' }
	| { code: 'jsonNoHowWeMet' };

export interface ImportReport {
	counts: ImportCounts;
	warnings: ImportWarning[];
	skipped: SkippedRecords[];
}

export interface ImportPlan {
	contacts: ImportedContact[];
	contactFields: NewContactField[];
	relationshipTypes: ImportedRelationshipType[];
	relationships: NewRelationship[];
	notes: NewNote[];
	gifts: Gift[];
	todos: Todo[];
	interactions: NewInteraction[];
	tags: NewTag[];
	contactTags: { contactId: string; tagId: string }[];
	photos: ImportedPhoto[];
	report: ImportReport;
}

/** Everything the per-table planners share: the ids, who and when, and the report. */
export interface MonicaPlanContext {
	/** The export's id prefix, so importing the same export twice finds its own rows. */
	prefix: string;
	contactId: (sourceId: MonicaId) => string;
	/** The contacts not deleted in Monica; a record of any other is left out. */
	liveIds: ReadonlySet<MonicaId>;
	opts: ImportOptions;
	/** Who wrote a record, how visible it is and when: the same for every imported row. */
	stamp: Pick<NewContact, 'createdBy' | 'visibility' | 'createdAt' | 'updatedAt'>;
	skip: (what: SkippedKind, why: SkippedReason, count?: number, detail?: string) => void;
	warn: (warning: ImportWarning) => void;
}

/** Plan the import of a Monica export. Pure; see the module comment. */
export function planMonicaImport(exp: SourceExport, opts: ImportOptions): ImportPlan {
	const prefix = sourcePrefix(exp.source);
	const warnings: ImportWarning[] = [];
	const skipped: SkippedRecords[] = [];
	const skip = (what: SkippedKind, why: SkippedReason, count = 1, detail?: string) => {
		const existing = skipped.find((s) => s.what === what && s.why === why);
		if (existing) existing.count += count;
		else skipped.push({ what, count, why, ...(detail === undefined ? {} : { detail }) });
	};

	const live = exp.contacts.filter((c) => c.deletedAt === null);
	const deleted = exp.contacts.length - live.length;
	if (deleted > 0) skip('contact', 'deletedInMonica', deleted);
	const ctx: MonicaPlanContext = {
		prefix,
		contactId: (sourceId) => `${prefix}:contact:${sourceId}`,
		liveIds: new Set(live.map((c) => c.id)),
		opts,
		stamp: {
			createdBy: opts.userId,
			visibility: opts.visibility,
			createdAt: opts.now,
			updatedAt: opts.now
		},
		skip,
		warn: (warning) => warnings.push(warning)
	};

	const contacts = planContacts(exp, live, ctx);
	const { relationships, relationshipTypes } = planRelationships(exp, ctx);
	const contactFields = planContactFields(exp, ctx);
	const { notes, gifts, todos, interactions } = planPersonRecords(exp, ctx);
	const { tags, contactTags } = planTags(exp, ctx);
	const photos = planPhotos(exp, live, ctx);

	// ── What has no place in Stella ─────────────────────────────────────────
	for (const j of exp.journalEntries) {
		skip('journalEntry', 'notAttachedToPerson', 1, j.title ?? j.post.slice(0, 40));
	}
	if (exp.derivedReminderCount > 0) {
		skip('reminder', 'remindersDerived', exp.derivedReminderCount);
	}
	if (exp.userCount > 1) {
		warnings.push({ code: 'manyUsers', count: exp.userCount });
	}
	if (exp.source === 'vcard') {
		warnings.push({ code: 'vcardPeopleOnly' });
	}
	if (exp.source === 'json') {
		// Monica's export resource for a contact lists neither field, so they are not in the
		// file at all — nothing the mapping can do but say so (docs/02 §2.16).
		warnings.push({ code: 'jsonNoHowWeMet' });
	}

	return {
		contacts,
		contactFields,
		relationshipTypes,
		relationships,
		notes,
		gifts,
		todos,
		interactions,
		tags,
		contactTags,
		photos,
		report: {
			counts: {
				contacts: contacts.length,
				relationships: relationships.length,
				relationshipTypes: relationshipTypes.length,
				contactFields: contactFields.length,
				notes: notes.length,
				gifts: gifts.length,
				todos: todos.length,
				interactions: interactions.length,
				tags: tags.length,
				photos: photos.length
			},
			warnings,
			skipped
		}
	};
}
