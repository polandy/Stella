import { describe, expect, it } from 'bun:test';
import { addressLine, ageOn, birthdayFact, profileRows, recordMenu } from './identity-card';

/*
 * The identity card at the top of a person's page (docs/05 §5.5): which facts it states, which
 * editable rows it shows, which fold behind one quiet button, and what its ⋯ menu offers.
 */

const nothing = { contact: false, tags: false, job: false, dates: false, circles: false, gender: false };

describe('profileRows', () => {
	it('folds every empty row behind the one button, contact details and tags first', () => {
		const rows = profileRows(nothing);
		expect(rows.shown).toEqual([]);
		expect(rows.behindAddMore).toEqual(['contact', 'tags', 'job', 'dates', 'circles', 'gender']);
	});

	it('shows a row the record holds something for', () => {
		const rows = profileRows({ ...nothing, contact: true, tags: true, gender: true });
		expect(rows.shown).toEqual(['contact', 'tags', 'gender']);
		expect(rows.behindAddMore).toEqual(['job', 'dates', 'circles']);
	});

	it('keeps a job on record out of the rows: the facts already show and edit it', () => {
		const rows = profileRows({ ...nothing, job: true });
		expect(rows.shown).not.toContain('job');
		expect(rows.behindAddMore).not.toContain('job');
	});

	it('lists the folded rows in their places once the button is pressed', () => {
		const holds = { ...nothing, tags: true, gender: true };
		expect(profileRows(holds).listed).toEqual(['tags', 'gender']);
		expect(profileRows(holds, { revealed: true }).listed).toEqual([
			'contact',
			'tags',
			'job',
			'dates',
			'circles',
			'gender'
		]);
	});

	it('keeps a row listed that was on the card a moment ago, though it was just emptied', () => {
		const rows = profileRows(nothing, { kept: ['gender'] });
		expect(rows.listed).toEqual(['gender']);
		expect(rows.behindAddMore).toEqual(['contact', 'tags', 'job', 'dates', 'circles']);
	});

	it('keeps dates and circles on record as rows, so they can still be added to', () => {
		const rows = profileRows({ ...nothing, dates: true, circles: true });
		expect(rows.shown).toEqual(['dates', 'circles']);
	});
});

describe('ageOn', () => {
	it('counts the birthdays already had', () => {
		expect(ageOn('2015-05-20', '2026-10-05')).toBe(11);
		expect(ageOn('2015-05-20', '2026-05-19')).toBe(10);
		expect(ageOn('2015-05-20', '2026-05-20')).toBe(11);
	});

	it('is null without a year, or for a day still to come', () => {
		expect(ageOn('--05-20', '2026-10-05')).toBeNull();
		expect(ageOn('2027-01-01', '2026-10-05')).toBeNull();
	});
});

describe('birthdayFact', () => {
	const today = '2026-10-05';

	it('prefers a birthday among the dates over the profile', () => {
		expect(
			birthdayFact(
				{
					derivedBirthday: null,
					estimatedBirthYear: null,
					dates: [
						{ kind: 'anniversary', date: '2010-06-01' },
						{ kind: 'birthday', date: '2015-05-20' }
					]
				},
				today
			)
		).toEqual({ kind: 'day', date: '2015-05-20', age: 11 });
	});

	it('falls back to the profile birthday, with no age when it has no year', () => {
		expect(birthdayFact({ derivedBirthday: '--05-20', estimatedBirthYear: null, dates: [] }, today)).toEqual({
			kind: 'day',
			date: '--05-20',
			age: null
		});
	});

	it('says "around" for a year that is only estimated', () => {
		expect(birthdayFact({ derivedBirthday: null, estimatedBirthYear: '1960', dates: [] }, today)).toEqual({
			kind: 'around',
			year: '1960'
		});
	});

	it('is null when nothing says when they were born', () => {
		expect(birthdayFact({ derivedBirthday: null, estimatedBirthYear: null, dates: [] }, today)).toBeNull();
	});
});

describe('addressLine', () => {
	it('is the first address, on one line', () => {
		expect(
			addressLine([
				{ kind: 'phone', value: '+41 79 000 00 00' },
				{ kind: 'address', value: 'Thunstrasse 12\n3074 Muri bei Bern' },
				{ kind: 'address', value: 'Elsewhere' }
			])
		).toBe('Thunstrasse 12, 3074 Muri bei Bern');
	});

	it('is null without one', () => {
		expect(addressLine([{ kind: 'email', value: 'lena@example.org' }])).toBeNull();
	});
});

describe('recordMenu', () => {
	const viewer = { isAdmin: true, archived: false, isSelf: false, canTracePath: true };

	it('offers logging first, then the record-keeping actions in their order', () => {
		expect(recordMenu(viewer)).toEqual([
			'logContact',
			'divider',
			'thisIsMe',
			'tracePath',
			'archive',
			'merge',
			'delete'
		]);
	});

	it('lets go of the self link and brings an archived person back', () => {
		const menu = recordMenu({ ...viewer, isSelf: true, archived: true });
		expect(menu).toContain('notMe');
		expect(menu).toContain('restore');
		expect(menu).not.toContain('thisIsMe');
		expect(menu).not.toContain('archive');
	});

	it('keeps merging and deleting for admins, and the path for a household with others in it', () => {
		const menu = recordMenu({ ...viewer, isAdmin: false, canTracePath: false });
		expect(menu).toEqual(['logContact', 'divider', 'thisIsMe', 'archive']);
	});
});
