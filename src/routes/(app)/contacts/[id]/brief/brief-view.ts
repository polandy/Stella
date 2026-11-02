import { mentionSnippet } from '$lib/mentions/snippet';
import { addressLines } from '$lib/people/identity-card';
import type { BriefBlock, FamilyMember } from '$lib/people/brief';
import { contactSectionPath, journalEntryPath } from '$lib/people/sections';
import type { InteractionKind } from '$lib/story/interaction-kinds';
import type { UpcomingDate } from '$lib/server/domain/dates/upcoming';
import type { Gift } from '$lib/server/domain/gifts/gifts';
import type { HomeOf } from '$lib/server/domain/homes/homes';
import type { Note } from '$lib/server/domain/notes/notes';
import type { StoryItem } from '$lib/server/domain/story/story';
import type { Todo } from '$lib/server/domain/todos/todos';

/*
 * The brief's blocks as the page renders them (docs/02 §2.2.5): one short line per row and the
 * place it is edited, so tapping any row lands where it can be changed. The words around them —
 * *turns 13*, *daughter*, a veil's label — are the component's, in the reader's language.
 */

/** How long a note's or a moment's line runs before it is cut: one line on a phone. */
const BRIEF_LINE_LENGTH = 90;

/** What the brief's rows are made of, as read through the access layer. */
export interface BriefRead {
	next: UpcomingDate;
	home: BriefHome;
	note: Note;
	moment: StoryItem;
	todo: Todo;
	idea: Gift;
}

/** An address the person lives at: a home shared with others, or one of their own details. */
export interface BriefHome {
	id: string;
	line: string;
	livesWith: { id: string; displayName: string }[];
}

/** Their shared homes first, then any address of their own the homes do not already say. */
export function briefHomes(
	homes: readonly HomeOf[],
	fields: readonly { id: string; kind: string; label: string | null; value: string }[]
): BriefHome[] {
	const shared = homes.map((home) => ({
		id: home.id,
		line: oneLine(home.value),
		livesWith: home.livesWith
	}));
	const said = new Set(shared.map((home) => home.line));
	const own = addressLines(fields)
		.filter((address) => !said.has(address.line))
		.map((address) => ({ id: address.id, line: address.line, livesWith: [] }));
	return [...shared, ...own];
}

const oneLine = (value: string) =>
	value
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
		.join(', ');

export type BriefMomentView = {
	id: string;
	day: string;
	line: string | null;
	isPrivate: boolean;
	href: string;
	veilId: string;
} & (
	| { kind: 'moment'; interactionKind: null }
	| { kind: 'touchpoint'; interactionKind: InteractionKind }
);

export type BriefBlockView =
	| {
			kind: 'next';
			date: UpcomingDate & { isSubject: boolean; href: string };
	  }
	| {
			kind: 'family';
			members: (FamilyMember & { href: string })[];
			homes: (BriefHome & { href: string })[];
	  }
	| {
			kind: 'notes';
			notes: { id: string; title: string | null; line: string; isPrivate: boolean; href: string }[];
	  }
	| { kind: 'lately'; items: BriefMomentView[] }
	| {
			kind: 'todos';
			todos: {
				id: string;
				title: string;
				dueOn: string | null;
				isPrivate: boolean;
				href: string;
			}[];
	  }
	| {
			kind: 'gifts';
			ideas: {
				id: string;
				title: string;
				occasion: string | null;
				isPrivate: boolean;
				href: string;
			}[];
	  }
	| { kind: 'met'; line: string; href: string };

export interface BriefViewContext {
	/** The person the brief is of. */
	contactId: string;
	/** Display name of a person the viewer may see, or null — for @-mentions in a line. */
	nameOf: (contactId: string) => string | null;
}

const personPath = (contactId: string) => `/contacts/${contactId}`;

/** Each block with its rows cut to one line and linked to where they are kept. */
export function briefBlockView(
	block: BriefBlock<BriefRead>,
	ctx: BriefViewContext
): BriefBlockView {
	const section = (name: Parameters<typeof contactSectionPath>[1]) =>
		contactSectionPath(ctx.contactId, name);
	switch (block.kind) {
		case 'next':
			return {
				kind: 'next',
				date: {
					...block.date,
					isSubject: block.date.contactId === ctx.contactId,
					href: personPath(block.date.contactId)
				}
			};
		case 'family':
			return {
				kind: 'family',
				members: block.members.map((member) => ({ ...member, href: personPath(member.id) })),
				// A home is edited on the card at the top of the person's page.
				homes: block.homes.map((home) => ({ ...home, href: personPath(ctx.contactId) }))
			};
		case 'notes':
			return {
				kind: 'notes',
				notes: block.notes.map((note) => ({
					id: note.id,
					title: note.title,
					line: mentionSnippet(note.body, ctx.nameOf, BRIEF_LINE_LENGTH),
					isPrivate: note.visibility === 'private',
					href: section('notes')
				}))
			};
		case 'lately':
			return { kind: 'lately', items: block.items.flatMap((item) => momentView(item, ctx)) };
		case 'todos':
			return {
				kind: 'todos',
				todos: block.todos.map((todo) => ({
					id: todo.id,
					title: todo.title,
					dueOn: todo.dueOn,
					isPrivate: todo.visibility === 'private',
					href: section('todos')
				}))
			};
		case 'gifts':
			return {
				kind: 'gifts',
				ideas: block.ideas.map((gift) => ({
					id: gift.id,
					title: gift.title,
					occasion: gift.occasion,
					isPrivate: gift.visibility === 'private',
					href: section('gifts')
				}))
			};
		case 'met':
			// *How we met* is kept on the card at the top of the person's page.
			return { kind: 'met', line: block.line, href: personPath(ctx.contactId) };
	}
}

/** A moment or a touchpoint as one row; the brief never hands it anything else. */
function momentView(item: StoryItem, ctx: BriefViewContext): BriefMomentView[] {
	if (item.kind === 'journal') {
		const entry = item.entry;
		return [
			{
				kind: 'moment',
				interactionKind: null,
				id: entry.id,
				day: item.day,
				line: entry.title ?? (mentionSnippet(entry.body, ctx.nameOf, BRIEF_LINE_LENGTH) || null),
				isPrivate: entry.visibility === 'private',
				href: journalEntryPath(ctx.contactId, entry.id),
				veilId: `journal:${entry.id}`
			}
		];
	}
	if (item.kind === 'interaction') {
		const touchpoint = item.interaction;
		return [
			{
				kind: 'touchpoint',
				interactionKind: touchpoint.kind,
				id: touchpoint.id,
				day: item.day,
				line: touchpoint.title,
				isPrivate: touchpoint.visibility === 'private',
				href: contactSectionPath(ctx.contactId, 'story'),
				veilId: `interaction:${touchpoint.id}`
			}
		];
	}
	return [];
}
