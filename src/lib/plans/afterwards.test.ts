import { describe, expect, it } from 'bun:test';
import { momentDraftOf } from './afterwards';

/*
 * *Write a moment* after an outing (docs/dev/02 §2.27.8): the composer starts from the idea, on
 * the day it was done, and saving links the moment to it.
 */

const idea = {
	id: 'p1',
	title: 'Climbing hall',
	visibility: 'shared' as const,
	hiddenFromPerson: false,
	doneOn: '2026-11-14'
};

describe('momentDraftOf', () => {
	it('starts from the title, on the day it was done, linked to the idea', () => {
		expect(momentDraftOf(idea, '2026-11-17')).toEqual({
			body: 'Climbing hall',
			visibility: 'shared',
			newPeople: [],
			subjectIds: [],
			planId: 'p1',
			entryDate: '2026-11-14'
		});
	});

	it('keeps a private idea private', () => {
		expect(momentDraftOf({ ...idea, visibility: 'private' }, '2026-11-17').visibility).toBe(
			'private'
		);
	});

	it('starts a surprise kept from the person private, so the moment does not tell them', () => {
		expect(momentDraftOf({ ...idea, hiddenFromPerson: true }, '2026-11-17').visibility).toBe(
			'private'
		);
	});

	it('falls back on today when the idea is no longer done', () => {
		expect(momentDraftOf({ ...idea, doneOn: null }, '2026-11-17').entryDate).toBe('2026-11-17');
	});
});
