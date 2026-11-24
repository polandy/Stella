import { beforeEach, describe, expect, it } from 'bun:test';
import type { PartialDate } from '../../../dates/partial-date';
import { inEnglish } from '../../../i18n/phrase';
import {
	addToGiftGroup,
	detachFromGiftGroup,
	dissolveGiftGroup,
	editGiftGroup,
	markGiftGroupBought,
	removeOpenOfGiftGroup
} from './gift-group-follow-up';
import type { GiftGroup, GiftGroupDeps, GroupWrite } from './gift-groups';
import { NO_GIVER, GiftGoneError, InvalidGiftError, type Gift } from './gifts';

// Following up one idea for several people (docs/dev/02 §2.25.11); today is 2026-11-18.

const ANDY = { userId: 'andy', householdId: 'h1' };
const born = (value: string): PartialDate => ({ value, precision: 'full' });
const BIRTHS: Record<string, PartialDate | null> = {
	mia: born('2022-01-20'),
	ben: born('2022-08-02'),
	lea: born('2023-12-28'),
	emma: born('2019-05-10'),
	finn: born('2024-02-29'),
	noah: null,
	andy: born('1985-04-02')
};
const NOW = Date.UTC(2026, 10, 18, 9);

let group: GiftGroup | null;
let gifts: Map<string, Gift>;
let writes: GroupWrite[];
let years: { contactId: string; year: string | null }[];
let deps: GiftGroupDeps;
let counter: number;

const giftFor = (contactId: string, over: Partial<Gift> = {}): Gift => ({
	id: `g-${contactId}`,
	...NO_GIVER,
	storedAt: null,
	value: null,
	contactId,
	createdBy: 'andy',
	visibility: 'shared',
	hiddenFromRecipient: false,
	state: 'idea',
	title: 'Puzzle',
	note: null,
	url: null,
	givenOn: null,
	occasion: null,
	when: { kind: 'at_age', age: 5 },
	whenCheckedOn: null,
	groupId: 'gg',
	createdAt: 1,
	updatedAt: 1,
	...over
});

beforeEach(() => {
	counter = 0;
	writes = [];
	years = [];
	group = {
		id: 'gg',
		householdId: 'h1',
		createdBy: 'andy',
		title: 'Puzzle',
		note: null,
		url: null,
		when: { kind: 'at_age', age: 5 },
		occasion: 'birthday',
		visibility: 'shared',
		hiddenFromRecipients: false,
		createdAt: 1,
		updatedAt: 1
	};
	gifts = new Map(
		[
			giftFor('mia', { state: 'given', givenOn: '2027-01-20', when: null }),
			giftFor('ben'),
			giftFor('lea', { state: 'bought' })
		].map((g) => [g.id, g])
	);
	deps = {
		groups: {
			async insert() {},
			async findVisibleTo(_viewer, id) {
				if (!group || id !== group.id) return null;
				const inGroup = [...gifts.values()].filter((g) => g.groupId === group?.id);
				return {
					group,
					gifts: inGroup.map((g) => ({
						...g,
						contactName: g.contactId,
						birth: BIRTHS[g.contactId] ?? null
					}))
				};
			},
			async listVisibleTo() {
				return [];
			},
			async listForContactVisibleTo() {
				return [];
			},
			async write(change) {
				writes.push(change);
				if (change.group) group = change.group;
				for (const g of [...(change.insert ?? []), ...(change.update ?? [])]) gifts.set(g.id, g);
				for (const id of change.remove ?? []) gifts.delete(id);
				for (const id of change.release ?? []) {
					const g = gifts.get(id);
					if (g) gifts.set(id, { ...g, groupId: null });
				}
			}
		},
		ownPeople: {
			async memberWhoseOwnPerson(_household, contactId) {
				return contactId === 'andy' ? 'andy' : null;
			}
		},
		contacts: {
			async findByIdVisibleTo(_viewer, id) {
				if (!(id in BIRTHS)) return null;
				const birth = BIRTHS[id];
				return {
					id,
					birthDate: birth?.value ?? null,
					birthDatePrecision: birth?.precision ?? 'full'
				} as never;
			}
		},
		birthYears: {
			async setBirthYear(_viewer, contactId, year) {
				years.push({ contactId, year });
				return true;
			}
		},
		ids: { next: () => `id-${++counter}` },
		clock: { now: () => NOW }
	};
});

async function refusal(promise: Promise<unknown>): Promise<string> {
	try {
		await promise;
	} catch (error) {
		if (error instanceof InvalidGiftError) return inEnglish(error.phrase);
		throw error;
	}
	throw new Error('expected a refusal');
}

const open = () =>
	[...gifts.values()]
		.filter((g) => g.groupId === 'gg' && (g.state === 'idea' || g.state === 'bought'))
		.map((g) => g.contactId)
		.sort();

describe('adding someone to a group', () => {
	it('gives them the group’s when, title and visibility, worked out for them', async () => {
		const result = await addToGiftGroup(deps, ANDY, {
			groupId: 'gg',
			recipients: [{ contactId: 'finn' }]
		});
		expect(result).toEqual({ groupId: 'gg', giftIds: ['id-1'], skipped: [] });
		expect(gifts.get('id-1')).toMatchObject({
			contactId: 'finn',
			groupId: 'gg',
			title: 'Puzzle',
			state: 'idea',
			visibility: 'shared',
			when: { kind: 'at_age', age: 5 }
		});
	});

	it('leaves out whom it no longer fits and who already has it open, and names the first', async () => {
		const result = await addToGiftGroup(deps, ANDY, {
			groupId: 'gg',
			recipients: [{ contactId: 'ben' }, { contactId: 'emma' }, { contactId: 'finn' }]
		});
		expect(result.skipped).toEqual([{ contactId: 'emma', problem: 'birthdayPassed' }]);
		expect(open()).toEqual(['ben', 'finn', 'lea']);
	});

	it('takes an estimated birth year and keeps it on the person', async () => {
		await addToGiftGroup(deps, ANDY, {
			groupId: 'gg',
			recipients: [{ contactId: 'noah', birthYear: '2023' }]
		});
		expect(years).toEqual([{ contactId: 'noah', year: '2023' }]);
	});

	it('keeps a surprise for everyone in it, and refuses one for the author’s own person', async () => {
		group = { ...group!, hiddenFromRecipients: true };
		await addToGiftGroup(deps, ANDY, { groupId: 'gg', recipients: [{ contactId: 'finn' }] });
		expect(gifts.get('id-1')?.hiddenFromRecipient).toBe(true);
		expect(
			await refusal(
				addToGiftGroup(deps, ANDY, {
					groupId: 'gg',
					recipients: [{ contactId: 'andy', when: null }]
				})
			)
		).toContain('from yourself');
	});

	it('refuses when it fits nobody, and answers gone for a group not seen', async () => {
		expect(
			await refusal(
				addToGiftGroup(deps, ANDY, { groupId: 'gg', recipients: [{ contactId: 'emma' }] })
			)
		).toBeTruthy();
		await expect(
			addToGiftGroup(deps, ANDY, { groupId: 'nope', recipients: [{ contactId: 'finn' }] })
		).rejects.toBeInstanceOf(GiftGoneError);
	});
});

describe('changing a group', () => {
	it('rewrites the group and every open gift, and leaves the one given as it was given', async () => {
		const result = await editGiftGroup(deps, ANDY, {
			groupId: 'gg',
			title: 'Puzzle, 60 pieces',
			note: 'blue box',
			url: null
		});
		expect(result).toEqual({ groupId: 'gg', giftIds: ['g-ben', 'g-lea'], kept: [] });
		expect(group?.title).toBe('Puzzle, 60 pieces');
		expect(gifts.get('g-ben')).toMatchObject({ title: 'Puzzle, 60 pieces', note: 'blue box' });
		expect(gifts.get('g-lea')?.title).toBe('Puzzle, 60 pieces');
		expect(gifts.get('g-mia')?.title).toBe('Puzzle');
	});

	it('times each open idea anew, and keeps the old time where the new one does not fit (D6)', async () => {
		gifts.set('g-emma', giftFor('emma', { when: null }));
		const result = await editGiftGroup(deps, ANDY, {
			groupId: 'gg',
			title: 'Puzzle',
			note: null,
			url: null,
			when: { kind: 'christmas_at_age', age: 6 }
		});
		expect(result.kept).toEqual(['emma']);
		expect(group?.when).toEqual({ kind: 'christmas_at_age', age: 6 });
		expect(gifts.get('g-ben')).toMatchObject({
			when: { kind: 'christmas_at_age', age: 6 },
			whenCheckedOn: '2026-11-18'
		});
		expect(gifts.get('g-emma')?.when).toBeNull();
		// A bought one keeps the time it was bought for.
		expect(gifts.get('g-lea')?.when).toEqual({ kind: 'at_age', age: 5 });
	});

	it('changes only one person’s gift when asked, and leaves the group as noted', async () => {
		await editGiftGroup(deps, ANDY, {
			groupId: 'gg',
			giftId: 'g-ben',
			title: 'Puzzle in blue',
			note: null,
			url: null,
			when: null
		});
		expect(gifts.get('g-ben')).toMatchObject({ title: 'Puzzle in blue', when: null });
		expect(gifts.get('g-lea')?.title).toBe('Puzzle');
		expect(group?.title).toBe('Puzzle');
	});

	it('refuses a time that does not fit the one, and a gift already given', async () => {
		expect(
			await refusal(
				editGiftGroup(deps, ANDY, {
					groupId: 'gg',
					giftId: 'g-ben',
					title: 'Puzzle',
					note: null,
					url: null,
					when: { kind: 'at_age', age: 3 }
				})
			)
		).toBeTruthy();
		expect(
			await refusal(
				editGiftGroup(deps, ANDY, {
					groupId: 'gg',
					giftId: 'g-mia',
					title: 'Puzzle',
					note: null,
					url: null
				})
			)
		).toContain('already');
		expect(
			await refusal(editGiftGroup(deps, ANDY, { groupId: 'gg', title: ' ', note: null, url: null }))
		).toBeTruthy();
	});
});

describe('the whole group at once', () => {
	it('marks every open idea bought, and only those', async () => {
		gifts.set('g-finn', giftFor('finn'));
		const result = await markGiftGroupBought(deps, ANDY, { groupId: 'gg' });
		expect(result.giftIds).toEqual(['g-ben', 'g-finn']);
		expect(gifts.get('g-ben')?.state).toBe('bought');
		expect(gifts.get('g-mia')?.state).toBe('given');
	});

	it('removes the open gifts and keeps the given one', async () => {
		await removeOpenOfGiftGroup(deps, ANDY, { groupId: 'gg' });
		expect([...gifts.keys()]).toEqual(['g-mia']);
	});

	it('lets every gift go on alone', async () => {
		const result = await dissolveGiftGroup(deps, ANDY, { groupId: 'gg' });
		expect(result.giftIds).toEqual(['g-mia', 'g-ben', 'g-lea']);
		expect([...gifts.values()].every((g) => g.groupId === null)).toBe(true);
	});

	it('lets one gift go on alone, and answers gone for one not in it', async () => {
		await detachFromGiftGroup(deps, ANDY, { groupId: 'gg', giftId: 'g-ben' });
		expect(gifts.get('g-ben')?.groupId).toBeNull();
		expect(gifts.get('g-lea')?.groupId).toBe('gg');
		await expect(
			detachFromGiftGroup(deps, ANDY, { groupId: 'gg', giftId: 'g-ben' })
		).rejects.toBeInstanceOf(GiftGoneError);
	});
});
