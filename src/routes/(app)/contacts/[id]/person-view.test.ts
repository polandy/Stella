import { describe, expect, it } from 'bun:test';
import type { Interaction } from '$lib/server/domain/interactions/interactions';
import type { MentionedIn } from '$lib/server/domain/mentions/mentioned-in';
import type { Note } from '$lib/server/domain/notes/notes';
import {
	birthdayOf,
	declinedBy,
	fieldView,
	interactionView,
	mentionedInView,
	noteView,
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
		expect(birthdayOf({ birthDate: '1980-04-12', birthDatePrecision: 'full' }, dates).derivedBirthday).toBeNull();
	});
});

function interaction(overrides: Partial<Interaction> = {}): Interaction {
	return {
		id: 'i1',
		contactId: 'c1',
		createdBy: VIEWER,
		visibility: 'shared',
		kind: 'call',
		happenedAt: '2026-09-01',
		title: 'Catch-up',
		description: null,
		createdAt: 1,
		updatedAt: 1,
		participants: [{ contactId: 'c-anna', displayName: 'Anna Brunner', avatarPhotoId: 'p1' }],
		...overrides
	};
}

describe('interactionView', () => {
	it('marks the viewer’s own touchpoints, which are the ones they may remove', () => {
		expect(interactionView(interaction(), VIEWER).mine).toBe(true);
		expect(interactionView(interaction({ createdBy: 'user-2' }), VIEWER).mine).toBe(false);
	});

	it('names the participants and sends nothing else about them', () => {
		expect(interactionView(interaction(), VIEWER).participants).toEqual([
			{ contactId: 'c-anna', displayName: 'Anna Brunner' }
		]);
	});
});

describe('fieldView', () => {
	it('carries a link for a field that can be followed, and none for one that cannot', () => {
		const email = { id: 'f1', contactId: 'c1', kind: 'email' as const, label: null, value: 'a@b.ch' };
		expect(fieldView(email)).toEqual({ id: 'f1', kind: 'email', label: null, value: 'a@b.ch', href: 'mailto:a@b.ch' });
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

describe('noteView', () => {
	it('renders the body with each mention read as the person’s current name', () => {
		expect(noteView(note(), context().nameOf).bodyHtml).toContain('Anna Brunner');
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
		expect(mentionedInView(reference({ kind: 'note' }), context()).href).toBe('/contacts/c-anna#section-notes');
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
		expect(declinedBy(suggestions, context().nameOfAuthor)).toEqual({ 'user-2': 'Hans Brunner', 'user-gone': null });
	});
});
