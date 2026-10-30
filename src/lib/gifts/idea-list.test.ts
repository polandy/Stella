import { describe, expect, it } from 'bun:test';
import { christmasFrom, ideaListGroups } from './idea-list';

/*
 * The household's list of open gift ideas (docs/02 §2.25.6): one group per person, whoever's
 * occasion comes next on top — their next birthday, or Christmas when that comes first or no
 * birthday is on the radar.
 */

const idea = (id: string, contactId: string, contactName = contactId) => ({
	id,
	contactId,
	contactName,
	avatarPhotoId: null
});

describe('christmasFrom', () => {
	it('is this year’s Christmas Eve while it is still ahead', () => {
		expect(christmasFrom('2026-10-30')).toEqual({ date: '2026-12-24', daysUntil: 55 });
	});

	it('is today on Christmas Eve', () => {
		expect(christmasFrom('2026-12-24')).toEqual({ date: '2026-12-24', daysUntil: 0 });
	});

	it('is next year’s once it has passed', () => {
		expect(christmasFrom('2026-12-25')).toEqual({ date: '2027-12-24', daysUntil: 364 });
	});
});

describe('ideaListGroups', () => {
	const today = '2026-10-30';

	it('groups the ideas by person, in the order they arrive', () => {
		const groups = ideaListGroups(
			[idea('a', 'hilde'), idea('b', 'marco'), idea('c', 'hilde')],
			[],
			today
		);
		expect(groups.map((g) => [g.contactId, g.ideas.map((i) => i.id)])).toEqual([
			['hilde', ['a', 'c']],
			['marco', ['b']]
		]);
	});

	it('puts whoever’s next occasion comes first on top', () => {
		const groups = ideaListGroups(
			[idea('a', 'lea'), idea('b', 'marco'), idea('c', 'hilde')],
			[
				{ contactId: 'hilde', kind: 'birthday', date: '2026-11-11', daysUntil: 12 },
				{ contactId: 'marco', kind: 'birthday', date: '2026-12-02', daysUntil: 33 },
				{ contactId: 'lea', kind: 'birthday', date: '2027-01-20', daysUntil: 82 }
			],
			today
		);
		expect(groups.map((g) => [g.contactId, g.next])).toEqual([
			['hilde', { kind: 'birthday', date: '2026-11-11', daysUntil: 12 }],
			['marco', { kind: 'birthday', date: '2026-12-02', daysUntil: 33 }],
			['lea', { kind: 'christmas', date: '2026-12-24', daysUntil: 55 }]
		]);
	});

	it('falls back on Christmas without a birthday on the radar', () => {
		const [group] = ideaListGroups([idea('a', 'tim')], [], today);
		expect(group!.next).toEqual({ kind: 'christmas', date: '2026-12-24', daysUntil: 55 });
	});

	it('reads only birthdays, the first one of each person', () => {
		const [group] = ideaListGroups(
			[idea('a', 'hilde')],
			[
				{ contactId: 'hilde', kind: 'anniversary', date: '2026-11-01', daysUntil: 2 },
				{ contactId: 'hilde', kind: 'birthday', date: '2026-11-11', daysUntil: 12 },
				{ contactId: 'hilde', kind: 'birthday', date: '2026-11-20', daysUntil: 21 }
			],
			today
		);
		expect(group!.next).toEqual({ kind: 'birthday', date: '2026-11-11', daysUntil: 12 });
	});

	it('orders people sharing a day by name', () => {
		const groups = ideaListGroups([idea('a', 'z', 'Zora'), idea('b', 'a', 'Anna')], [], today);
		expect(groups.map((g) => g.contactName)).toEqual(['Anna', 'Zora']);
	});

	it('is empty without ideas', () => {
		expect(ideaListGroups([], [], today)).toEqual([]);
	});
});
