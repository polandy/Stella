import { describe, expect, it } from 'bun:test';
import type { ContactNameDeps } from '$lib/server/domain/contacts/contact-names';
import { NOTHING_FOUND, type MomentHit, type NoteHit } from '$lib/server/domain/search/search';
import { searchForView } from './search-view';

/*
 * Search results as the page shows them (docs/02 §2.9): a note's or moment's snippet names the
 * people it mentions the way the chip does, only as far as the viewer may see them.
 */

const viewer = { id: 'u1', householdId: 'h1' };
const deps: ContactNameDeps = {
	contactNames: {
		listNamesAmongVisibleTo: async (_viewer, ids) =>
			ids.filter((id) => id === 'rosa').map((id) => ({ id, displayName: 'Rosa Brunner' }))
	}
} as ContactNameDeps;

const moment: MomentHit = {
	entryId: 'j1',
	title: null,
	body: 'Choir concert in the Münster with @{contact:rosa} and @{contact:secret}.',
	visibility: 'shared',
	entryDate: '2026-10-12',
	contactId: 'c1',
	contactName: 'Hans',
	otherNames: []
};
const note: NoteHit = {
	noteId: 'n1',
	title: null,
	body: 'Ask @{contact:rosa} about the choir',
	visibility: 'shared',
	contactId: 'c1',
	contactName: 'Hans'
};

describe('searchForView', () => {
	it('keeps the mentioned person in a snippet and never ships the stored body', async () => {
		const view = await searchForView(
			deps,
			viewer,
			{ ...NOTHING_FOUND, moments: [moment], notes: [note] },
			'rosa'
		);
		expect(view.moments[0].snippet).toBe(
			'Choir concert in the Münster with @Rosa Brunner and @unknown.'
		);
		expect(view.notes[0].snippet).toBe('Ask @Rosa Brunner about the choir');
		expect(view.moments[0]).not.toHaveProperty('body');
		expect(view.notes[0]).not.toHaveProperty('body');
	});
});
