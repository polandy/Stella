import { SECTION_FOR_REFERENCE, contactSectionPath } from '$lib/contacts/sections';
import { segmentsOf } from '$lib/i18n/linked';
import type { Translate } from '$lib/i18n/translate';
import { mentionSnippet } from '$lib/mentions/snippet';
import { fieldHref, type ContactField } from '$lib/server/domain/contact-fields/contact-fields';
import type { Contact } from '$lib/server/domain/contacts/contacts';
import {
	overridesDerivedBirthday,
	type ImportantDate
} from '$lib/server/domain/dates/important-dates';
import type { GraphModel } from '$lib/graph/model/types';
import type { Gift } from '$lib/server/domain/gifts/gifts';
import type { MentionedIn } from '$lib/server/domain/mentions/mentioned-in';
import { renderMarkdownWithMentions } from '$lib/server/domain/notes/markdown';
import type { Note } from '$lib/server/domain/notes/notes';
import type { ProposedLink } from '$lib/server/domain/relationships/suggestion-review';
import { authorLabel } from '$lib/story/author';
import type { LinkSuggestion } from '$lib/suggestions/types';

/*
 * Turn what the person page read into what it renders (docs/02 §2.2). Presentation, so the
 * edge's job — Markdown, names, links, who counts as "you" — kept out of `load` so each piece
 * is tested on its own rather than only through a whole page.
 */

/** What the pieces need to know about the reader. */
export interface PersonViewContext {
	/** The signed-in user: what they may remove, and who counts as "you". */
	viewerId: string;
	/** Display name of a person the viewer may see, or null. */
	nameOf: (contactId: string) => string | null;
	/** Name of the household member behind a user id, or null once they are gone. */
	nameOfAuthor: (userId: string) => string | null;
}

/** Whether a birth date precision (docs/03 §3.4) names an actual day rather than a year. */
const namesADay = (precision: Contact['birthDatePrecision']) =>
	precision === 'full' || precision === 'month_day';

/**
 * The birthday derived from the profile, unless an entered birthday takes over (§2.13.2) or the
 * birth date is only an estimated year, which names no day — then the year is offered instead.
 */
export function birthdayOf(
	contact: Pick<Contact, 'birthDate' | 'birthDatePrecision'>,
	dates: readonly Pick<ImportantDate, 'kind'>[]
): { derivedBirthday: string | null; estimatedBirthYear: string | null } {
	const namesDay = namesADay(contact.birthDatePrecision);
	return {
		derivedBirthday: overridesDerivedBirthday(dates) || !namesDay ? null : contact.birthDate,
		estimatedBirthYear: namesDay ? null : contact.birthDate
	};
}

/** The people in the visible graph by name — the visibility scope, archived people included. */
export function peopleNamedIn(graph: GraphModel): { id: string; displayName: string }[] {
	return graph.nodes.flatMap((node) =>
		node.kind === 'person' ? [{ id: node.id, displayName: node.label }] : []
	);
}

/**
 * The names of the circles in the visible graph, for the circle form's suggestions. Sorted by
 * code unit, which is how SQLite's default collation ordered the read this replaces.
 */
export function circleNamesIn(graph: GraphModel): string[] {
	return graph.nodes
		.flatMap((node) => (node.kind === 'circle' ? [node.label] : []))
		.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** A contact detail, with the link it opens (mail, phone, map) where there is one. */
export function fieldView(field: Pick<ContactField, 'id' | 'kind' | 'label' | 'value'>) {
	return {
		id: field.id,
		kind: field.kind,
		label: field.label,
		value: field.value,
		href: fieldHref(field.kind, field.value)
	};
}

/**
 * A gift as the Gifts card shows it (docs/02 §2.25). Who noted it is named by first name, like
 * an item of the story; `mine` is what offers *Private*, which only the author may set.
 */
export function giftView(gift: Gift, ctx: PersonViewContext) {
	const mine = gift.createdBy === ctx.viewerId;
	return {
		id: gift.id,
		state: gift.state,
		title: gift.title,
		note: gift.note,
		url: gift.url,
		givenOn: gift.givenOn,
		occasion: gift.occasion,
		visibility: gift.visibility,
		mine,
		notedBy: mine ? null : authorLabel(false, ctx.nameOfAuthor(gift.createdBy))
	};
}

/** A note, rendered server-side; the output is already safe (docs/02 §2.5). */
export function noteView(note: Note, nameOf: PersonViewContext['nameOf']) {
	return {
		id: note.id,
		title: note.title,
		bodyHtml: renderMarkdownWithMentions(note.body, nameOf),
		isPinned: note.isPinned,
		visibility: note.visibility,
		createdAt: note.createdAt
	};
}

/**
 * Where this person is named by somebody else (docs/02 §2.20.1). Read-only: the entry belongs
 * to the person it is about, so it links there rather than offering an edit on another page.
 */
export function mentionedInView(reference: MentionedIn, ctx: PersonViewContext) {
	return {
		kind: reference.kind,
		entryId: reference.entryId,
		sourceName: reference.sourceName,
		author: authorLabel(reference.authorId === ctx.viewerId, ctx.nameOfAuthor(reference.authorId)),
		visibility: reference.visibility,
		day: reference.day,
		title: reference.title,
		snippet: mentionSnippet(reference.body, ctx.nameOf),
		href: contactSectionPath(reference.sourceContactId, SECTION_FOR_REFERENCE[reference.kind])
	};
}

/**
 * Suggestions with their reason said in the reader's language, cut into words and people so
 * every name can be followed. A closure cannot cross `load` into `data`.
 */
export function withReasonsSaid(proposals: readonly ProposedLink[], t: Translate) {
	return proposals.map((proposal) => ({ ...proposal, reason: segmentsOf(proposal.reason(t)) }));
}

/** The members a declined suggestion names, by name — the review panel says who said no. */
export function declinedBy(
	suggestions: readonly Pick<LinkSuggestion, 'dismissed'>[],
	nameOfAuthor: PersonViewContext['nameOfAuthor']
): Record<string, string | null> {
	return Object.fromEntries(
		suggestions.flatMap(({ dismissed }) =>
			dismissed ? [[dismissed.by, nameOfAuthor(dismissed.by)]] : []
		)
	);
}
