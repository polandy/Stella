import { describe, expect, it } from 'bun:test';
import { mentionToken } from '$lib/mentions/mentions';
import type { JournalEntry } from '$lib/server/domain/journal/journal';
import { someJournalEntry } from '$lib/server/domain/testing';
import type { Remover } from '$lib/server/access/visibility';
import { journalEntriesFor } from './journal-view';

/*
 * The journal's entries as the page shows them (docs/02 §2.20): what only the author gets, who
 * wrote each, its photos, and the names its mentions carry. Rendering Markdown has its own suite.
 */

const VIEWER = 'u1';

const entry = (id: string, fields: Partial<JournalEntry> = {}) =>
	someJournalEntry(id, { createdBy: VIEWER, updatedAt: 2000, ...fields });

const MEMBERS = new Map([
	[VIEWER, 'Member'],
	['u2', 'Ben Brunner']
]);

/** The entries over `names` and `photos`, by the household above. */
function view(
	entries: JournalEntry[],
	{
		photos = [],
		names = [],
		remover = { id: VIEWER, householdId: 'h1', isAdmin: false }
	}: {
		remover?: Remover;
		photos?: { id: string; journalEntryId: string }[];
		names?: { id: string; displayName: string }[];
	} = {}
) {
	return journalEntriesFor({
		remover,
		person: { householdId: 'h1', ownerId: 'u9', visibility: 'shared' },
		entries,
		photos,
		names,
		nameOfAuthor: (id) => MEMBERS.get(id) ?? null
	});
}

describe('journalEntriesFor', () => {
	it('shows an entry with its day, title, rendered body, audience and time', () => {
		const [shown] = view([entry('e1', { title: 'Sunday', visibility: 'private' })]);
		expect(shown).toMatchObject({
			id: 'e1',
			entryDate: '2026-10-09',
			title: 'Sunday',
			visibility: 'private',
			updatedAt: 2000
		});
		expect(shown!.bodyHtml).toContain('A walk by the river');
	});

	it("hands the author their entry's stored text to edit, and calls them you", () => {
		const body = `Met ${mentionToken('ben')} by the river`;
		const [shown] = view([entry('e1', { body })]);
		expect(shown).toMatchObject({ mine: true, author: 'you', bodyForEdit: body });
	});

	it("keeps another member's text from the edit form, and names them by their first name", () => {
		const [shown] = view([entry('e1', { createdBy: 'u2' })]);
		expect(shown).toMatchObject({ mine: false, author: 'Ben', bodyForEdit: null });
	});

	it('names nobody for an entry by someone no longer in the household', () => {
		const [shown] = view([entry('e1', { createdBy: 'gone' })]);
		expect(shown!.author).toBeNull();
	});

	it('gives each entry its own photos, in the order they came', () => {
		const shown = view([entry('e1'), entry('e2')], {
			photos: [
				{ id: 'p1', journalEntryId: 'e2' },
				{ id: 'p2', journalEntryId: 'e1' },
				{ id: 'p3', journalEntryId: 'e2' }
			]
		});
		expect(shown.map((e) => e.photos)).toEqual([['p2'], ['p1', 'p3']]);
	});

	it('names only the mentioned people the viewer may see', () => {
		const body = `${mentionToken('ben')} and ${mentionToken('hidden')}`;
		const [shown] = view([entry('e1', { body })], {
			names: [
				{ id: 'ben', displayName: 'Ben Brunner' },
				{ id: 'cleo', displayName: 'Cleo' }
			]
		});
		expect(shown!.mentionNames).toEqual({ ben: 'Ben Brunner' });
		expect(shown!.bodyHtml).toContain('Ben Brunner');
	});

	it('offers Remove to an admin on another member’s shared entry, never on a private one', () => {
		const admin: Remover = { id: 'u9', householdId: 'h1', isAdmin: true };
		const entries = [
			entry('shared', { createdBy: 'u2' }),
			entry('private', { createdBy: 'u2', visibility: 'private' })
		];
		expect(view(entries, { remover: admin }).map((e) => [e.id, e.removable, e.mine])).toEqual([
			['shared', true, false],
			['private', false, false]
		]);
		expect(view(entries).map((e) => e.removable)).toEqual([false, false]);
	});

	it('never hands an admin the text to edit', () => {
		const admin: Remover = { id: 'u9', householdId: 'h1', isAdmin: true };
		const [shown] = view([entry('shared', { createdBy: 'u2' })], { remover: admin });
		expect(shown?.bodyForEdit).toBeNull();
	});
});
