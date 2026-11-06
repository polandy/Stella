import { giftLink, isGiftState } from '../../../gifts/gifts';
import { FULL_DATE_SHAPE, isRealCalendarDay } from '../../../dates/calendar';
import { todayFor } from '../../../dates/today';
import type { MentionKind, RestoreContext } from './restore-context';
import { bool, ids, int, ms, records, str, visibilityOf, type Row } from './restore-fields';
import type { PhotoPlan } from './restore-photos';

/*
 * What each restored person carries (docs/02 §2.15): contact fields, dates, notes, journal
 * entries, touchpoints, gifts, to-dos and photos. A record without the one thing that makes it
 * one — a note without text, a gift without its name — is left out and named in the report.
 */

export interface PersonRecordRows {
	contactFields: Row[];
	importantDates: Row[];
	notes: Row[];
	noteMentions: Row[];
	journalEntries: Row[];
	journalMentions: Row[];
	interactions: Row[];
	participants: Row[];
	gifts: Row[];
	todos: Row[];
}

/** A gift's link if it is a web address; anything else is dropped rather than kept as a link. */
function webLinkOf(raw: string | null): string | null {
	const link = giftLink(raw ?? '');
	return link.ok ? link.url : null;
}

const isRealDay = (day: string | null): day is string =>
	day !== null && FULL_DATE_SHAPE.test(day) && isRealCalendarDay(day);

export function planPersonRecords(
	people: readonly Row[],
	knownPeople: ReadonlySet<string>,
	photos: PhotoPlan,
	ctx: RestoreContext
): PersonRecordRows {
	const { author, stamps, warn, now } = ctx;
	const rows: PersonRecordRows = {
		contactFields: [],
		importantDates: [],
		notes: [],
		noteMentions: [],
		journalEntries: [],
		journalMentions: [],
		interactions: [],
		participants: [],
		gifts: [],
		todos: []
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
			rows.contactFields.push({
				id: str(field, 'id') ?? ctx.ids.next(),
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
			rows.importantDates.push({
				id: str(date, 'id') ?? ctx.ids.next(),
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
			const noteId = str(note, 'id') ?? ctx.ids.next();
			rows.notes.push({
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
				rows.noteMentions.push({ note_id: noteId, contact_id: mentioned });
			}
		}

		for (const entry of records(person, 'journal')) {
			const body = str(entry, 'body');
			const day = str(entry, 'date');
			if (body === null || day === null) {
				warn({ code: 'journalEntryIncomplete' });
				continue;
			}
			const entryId = str(entry, 'id') ?? ctx.ids.next();
			rows.journalEntries.push({
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
				rows.journalMentions.push({ journal_entry_id: entryId, contact_id: mentioned });
			}
			for (const image of records(entry, 'photos'))
				photos.add(image, { contactId, journalEntryId: entryId });
		}

		for (const touch of records(person, 'interactions')) {
			const kind = str(touch, 'kind');
			const happenedAt = str(touch, 'happened_at');
			if (kind === null || happenedAt === null) {
				warn({ code: 'touchpointIncomplete' });
				continue;
			}
			const interactionId = str(touch, 'id') ?? ctx.ids.next();
			rows.interactions.push({
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
				rows.participants.push({ interaction_id: interactionId, contact_id: other });
			}
		}

		for (const giftRow of records(person, 'gifts')) {
			const state = str(giftRow, 'state');
			const title = str(giftRow, 'title');
			const givenOn = str(giftRow, 'given_on');
			// A gift needs its name and one of its three states; a given or received one, its day.
			const known = state !== null && isGiftState(state);
			if (!known || title === null || (state !== 'idea' && !isRealDay(givenOn))) {
				warn({ code: 'giftIncomplete' });
				continue;
			}
			rows.gifts.push({
				id: str(giftRow, 'id') ?? ctx.ids.next(),
				contact_id: contactId,
				created_by: author(giftRow),
				visibility: visibilityOf(giftRow),
				state,
				title,
				note: str(giftRow, 'note'),
				// Only a web address is kept, as the form keeps it: the card renders it as a link.
				url: webLinkOf(str(giftRow, 'url')),
				given_on: state === 'idea' ? null : givenOn,
				occasion: str(giftRow, 'occasion'),
				...stamps(giftRow)
			});
		}

		for (const todoRow of records(person, 'todos')) {
			const title = str(todoRow, 'title');
			// A to-do needs its line; a day that is not one is dropped rather than the to-do.
			if (title === null) {
				warn({ code: 'todoIncomplete' });
				continue;
			}
			const dueOn = str(todoRow, 'due_on');
			const doneAt = ms(todoRow, 'done_at');
			const doneBy = str(todoRow, 'done_by');
			const doneOn = str(todoRow, 'done_on');
			rows.todos.push({
				id: str(todoRow, 'id') ?? ctx.ids.next(),
				contact_id: contactId,
				created_by: author(todoRow),
				visibility: visibilityOf(todoRow),
				title,
				due_on: isRealDay(dueOn) ? dueOn : null,
				done_at: doneAt,
				// The day it was ticked, as written; an archive without one takes the tick's day here.
				done_on:
					doneAt === null ? null : isRealDay(doneOn) ? doneOn : todayFor({ now: () => doneAt }),
				// Who ticked it only when they are a member here; the tick itself stays.
				done_by: doneAt !== null && doneBy !== null && ctx.members.has(doneBy) ? doneBy : null,
				...stamps(todoRow)
			});
		}

		for (const image of records(person, 'photos'))
			photos.add(image, { contactId, journalEntryId: null });
	}

	return rows;
}
