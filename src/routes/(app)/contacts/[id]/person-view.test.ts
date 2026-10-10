import { describe, expect, it } from 'bun:test';
import type { GraphModel } from '$lib/graph/model/types';
import type { MentionedIn } from '$lib/server/domain/mentions/mentioned-in';
import type { Gift } from '$lib/server/domain/gifts/gifts';
import type { ContactAccess, Remover } from '$lib/server/access/visibility';
import type { Note } from '$lib/server/domain/notes/notes';
import {
	birthdayOf,
	declinedBy,
	fieldView,
	giftView,
	circleNamesIn,
	mentionedInView,
	noteView,
	peopleNamedIn,
	type PersonViewContext
} from './person-view';

/*
 * What the person page is handed (docs/02 §2.2), piece by piece. The reads are scoped by the
 * access layer; this decides what each piece says — including who counts as "you", which is
 * an authorization statement rendered as a control.
 */

const VIEWER = 'user-1';

function context(overrides: Partial<PersonViewContext> = {}): PersonViewContext {
	return {
		viewerId: VIEWER,
		nameOf: (id) => ({ 'c-anna': 'Anna Brunner' })[id] ?? null,
		nameOfAuthor: (id) => ({ [VIEWER]: 'Lena Brunner', 'user-2': 'Hans Brunner' })[id] ?? null,
		...overrides
	};
}

describe('birthdayOf', () => {
	it('derives the birthday from a birth date that names a day', () => {
		expect(birthdayOf({ birthDate: '1980-04-12', birthDatePrecision: 'full' }, [])).toEqual({
			derivedBirthday: '1980-04-12',
			estimatedBirthYear: null
		});
		expect(birthdayOf({ birthDate: '--04-12', birthDatePrecision: 'month_day' }, [])).toEqual({
			derivedBirthday: '--04-12',
			estimatedBirthYear: null
		});
	});

	it('names no birthday for an estimated year, and offers the year instead (docs/03 §3.4)', () => {
		expect(birthdayOf({ birthDate: '1980', birthDatePrecision: 'year' }, [])).toEqual({
			derivedBirthday: null,
			estimatedBirthYear: '1980'
		});
	});

	it('gives way to a birthday entered as a date of its own (docs/02 §2.13.2)', () => {
		const dates = [{ kind: 'birthday' as const }];
		expect(
			birthdayOf({ birthDate: '1980-04-12', birthDatePrecision: 'full' }, dates).derivedBirthday
		).toBeNull();
	});
});

describe('fieldView', () => {
	it('carries a link for a field that can be followed, and none for one that cannot', () => {
		const email = {
			id: 'f1',
			contactId: 'c1',
			kind: 'email' as const,
			label: null,
			value: 'a@b.ch'
		};
		expect(fieldView(email)).toEqual({
			id: 'f1',
			kind: 'email',
			label: null,
			value: 'a@b.ch',
			href: 'mailto:a@b.ch'
		});
	});
});

function note(overrides: Partial<Note> = {}): Note {
	return {
		id: 'n1',
		contactId: 'c1',
		createdBy: VIEWER,
		visibility: 'shared',
		title: null,
		body: 'hiked with @{contact:c-anna}',
		isPinned: false,
		createdAt: 5,
		updatedAt: 5,
		...overrides
	};
}

describe('giftView', () => {
	const gift = (overrides: Partial<Gift> = {}): Gift => ({
		id: 'g-1',
		contactId: 'c-hilde',
		createdBy: 'user-2',
		visibility: 'shared',
		state: 'idea',
		title: 'Teapot',
		note: 'The black one',
		url: 'https://shop.example',
		givenOn: null,
		occasion: null,
		createdAt: 1,
		updatedAt: 2,
		...overrides
	});

	it('says what the card shows, and who noted it by first name', () => {
		expect(giftView(gift(), context())).toEqual({
			id: 'g-1',
			state: 'idea',
			title: 'Teapot',
			note: 'The black one',
			url: 'https://shop.example',
			givenOn: null,
			occasion: null,
			visibility: 'shared',
			mine: false,
			notedBy: 'Hans',
			createdAt: 1
		});
	});

	it('marks the viewer’s own gift, which only they may make private', () => {
		expect(giftView(gift({ createdBy: VIEWER }), context()).mine).toBe(true);
	});
});

describe('noteView', () => {
	const person: ContactAccess = { householdId: 'h1', ownerId: VIEWER, visibility: 'shared' };
	const member: Remover = { id: VIEWER, householdId: 'h1', isAdmin: false };
	const admin: Remover = { ...member, isAdmin: true };
	const view = (n: Note, remover: Remover = member) => noteView(n, context(), remover, person);

	it('renders the body with each mention read as the person’s current name', () => {
		expect(view(note()).bodyHtml).toContain('Anna Brunner');
	});

	it('offers Remove on the viewer’s own note, unnamed', () => {
		expect(view(note())).toMatchObject({ removable: true, author: null });
		expect(view(note({ visibility: 'private' })).removable).toBe(true);
	});

	it('names another member’s note, removable only by an admin', () => {
		const theirs = note({ createdBy: 'user-2' });
		expect(view(theirs)).toMatchObject({ removable: false, author: 'Hans' });
		expect(view(theirs, admin).removable).toBe(true);
	});

	it('hands the author the stored source to edit, and the names its tokens read as', () => {
		const mine = view(note());
		expect(mine.editable).toBe(true);
		expect(mine.bodyForEdit).toBe(note().body);
		expect(mine.mentionNames).toEqual({ 'c-anna': 'Anna Brunner' });
	});

	it('gives an admin Remove but never Edit on another member’s shared note', () => {
		expect(view(note({ createdBy: 'user-2' }), admin)).toMatchObject({
			removable: true,
			editable: false,
			bodyForEdit: null
		});
	});

	it('gives a member neither on someone else’s note', () => {
		expect(view(note({ createdBy: 'user-2' }))).toMatchObject({
			removable: false,
			editable: false,
			bodyForEdit: null
		});
	});
});

function reference(overrides: Partial<MentionedIn> = {}): MentionedIn {
	return {
		kind: 'journal',
		entryId: 'j1',
		sourceContactId: 'c-anna',
		sourceName: 'Anna Brunner',
		authorId: 'user-2',
		visibility: 'shared',
		day: '2026-09-01',
		recordedAt: 7,
		title: null,
		body: 'lunch with @{contact:c-anna}',
		...overrides
	};
}

describe('mentionedInView', () => {
	it('names the author by first name, or as "you"', () => {
		expect(mentionedInView(reference(), context()).author).toBe('Hans');
		expect(mentionedInView(reference({ authorId: VIEWER }), context()).author).toBe('you');
	});

	it('links to where the entry is read on its own person: a note on Notes, an entry in the story', () => {
		expect(mentionedInView(reference(), context()).href).toBe('/contacts/c-anna#section-story');
		expect(mentionedInView(reference({ kind: 'note' }), context()).href).toBe(
			'/contacts/c-anna#section-notes'
		);
	});

	it('previews the body as plain text with the names the viewer may see', () => {
		expect(mentionedInView(reference(), context()).snippet).toBe('lunch with @Anna Brunner');
	});
});

describe('declinedBy', () => {
	it('names only the members a declined suggestion names', () => {
		const suggestions = [
			{ dismissed: { by: 'user-2', at: 1 } },
			{ dismissed: null },
			{ dismissed: { by: 'user-gone', at: 2 } }
		];
		expect(declinedBy(suggestions, context().nameOfAuthor)).toEqual({
			'user-2': 'Hans Brunner',
			'user-gone': null
		});
	});
});

/*
 * The person page names people and circles from the visible graph it reads for the map,
 * instead of reading the household's names and circles again (docs/04 §4.11).
 */
describe('names out of the visible graph', () => {
	const graph: GraphModel = {
		nodes: [
			{ id: 'c-zora', kind: 'person', label: 'Zora' },
			{ id: 'circle-b', kind: 'circle', label: 'Schule' },
			{ id: 'c-anna', kind: 'person', label: 'Anna Brunner' },
			{ id: 'circle-a', kind: 'circle', label: 'Chor' },
			{ id: 'circle-c', kind: 'circle', label: 'Ärzte' }
		],
		edges: []
	};

	it('names every person in it, and only people', () => {
		expect(peopleNamedIn(graph)).toEqual([
			{ id: 'c-zora', displayName: 'Zora' },
			{ id: 'c-anna', displayName: 'Anna Brunner' }
		]);
	});

	it("lists the circles' names in the order the database sorts them", () => {
		// SQLite's default collation compares bytes, so an umlaut sorts after every ASCII letter.
		expect(circleNamesIn(graph)).toEqual(['Chor', 'Schule', 'Ärzte']);
	});
});
