import { SECTION_FOR_REFERENCE, contactSectionPath } from '$lib/people/sections';
import { segmentsOf } from '$lib/i18n/linked';
import type { Translate } from '$lib/i18n/translate';
import { extractMentionIds } from '$lib/mentions/mentions';
import { mentionSnippet } from '$lib/mentions/snippet';
import { fieldHref, type ContactField } from '$lib/server/domain/contact-fields/contact-fields';
import type { Contact } from '$lib/server/domain/contacts/contacts';
import { namesADay } from '$lib/dates/partial-date';
import {
	overridesDerivedBirthday,
	type ImportantDate
} from '$lib/server/domain/dates/important-dates';
import type { GraphModel } from '$lib/graph/model/types';
import type { Gift } from '$lib/server/domain/gifts/gifts';
import type { MentionedIn } from '$lib/server/domain/mentions/mentioned-in';
import { renderMarkdownWithMentions } from '$lib/server/domain/notes/markdown';
import type { GalleryPhoto } from '$lib/server/domain/media/avatars';
import type { Note } from '$lib/server/domain/notes/notes';
import {
	canEditAuthored,
	canRemoveAuthored,
	type ContactAccess,
	type Remover
} from '$lib/server/access/visibility';
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
		notedBy: mine ? null : authorLabel(false, ctx.nameOfAuthor(gift.createdBy)),
		/** When it was noted, shown on an idea; given and received gifts show their day. */
		createdAt: gift.createdAt
	};
}

/**
 * A gallery photo as the page shows it: *Remove* is offered as the access layer allows
 * (docs/03 §3.7) — its uploader, or an admin on a shared one — never one that would fail.
 */
export function galleryPhotoView(photo: GalleryPhoto, remover: Remover, person: ContactAccess) {
	return {
		...photo,
		removable: canRemoveAuthored(remover, {
			ownerId: photo.createdBy,
			visibility: photo.visibility,
			contact: person
		})
	};
}

/**
 * A note, rendered server-side; the output is already safe (docs/02 §2.5). Someone else's is
 * named, and *Remove* and *Edit* are offered as the access layer allows (docs/03 §3.7).
 */
export function noteView(
	note: Note,
	ctx: PersonViewContext,
	remover: Remover,
	person: ContactAccess
) {
	const mine = note.createdBy === ctx.viewerId;
	const access = { ownerId: note.createdBy, visibility: note.visibility, contact: person };
	const editable = canEditAuthored(remover, access);
	return {
		id: note.id,
		title: note.title,
		bodyHtml: renderMarkdownWithMentions(note.body, ctx.nameOf),
		author: mine ? null : authorLabel(false, ctx.nameOfAuthor(note.createdBy)),
		removable: canRemoveAuthored(remover, access),
		editable,
		// The stored source, tokens and all, for the editor; only an author edits (docs/03 §3.7).
		bodyForEdit: editable ? note.body : null,
		// What each token in the body reads as — including people the @-picker does not offer,
		// such as the note's own subject.
		mentionNames: Object.fromEntries(
			extractMentionIds(note.body).flatMap((id) => {
				const name = ctx.nameOf(id);
				return name === null ? [] : [[id, name]];
			})
		),
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
