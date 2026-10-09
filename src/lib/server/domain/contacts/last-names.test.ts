import { describe, expect, it } from 'bun:test';
import type { KinshipGraph } from '../../../kinship/kinship';
import type { ActivityOf } from '../activity/activity';
import type { Contact } from './contacts';
import {
	countLastNames,
	readSurnameHelp,
	dismissLastName,
	EmptyLastNameError,
	LastNameWouldOverwriteError,
	restoreLastName,
	reviewLastNames,
	setLastNames,
	type NewSurnameDismissal,
	type SurnameListPerson
} from './last-names';
import type { NameWrite } from './name-parts';
import { inMemoryKinshipGraph } from '../testing';

/*
 * Last names for several people at once (docs/02 §2.2.4.4): the reviewed
 * list, the one batch write behind every bulk path, and the household's *not this name*.
 */

const NOW = 1_700_000_000_000;
const viewer = { id: 'user-1', householdId: 'household-1' };

function contact(
	id: string,
	first: string,
	last: string | null,
	over: Partial<Contact> = {}
): Contact {
	return {
		id,
		householdId: 'household-1',
		createdBy: 'user-1',
		visibility: 'shared',
		displayName: last ? `${first} ${last}` : first,
		firstName: first,
		lastName: last,
		nickname: null,
		formerName: null,
		jobTitle: null,
		company: null,
		description: null,
		howWeMet: null,
		metDate: null,
		metPlace: null,
		birthDate: null,
		birthDatePrecision: 'full',
		gender: null,
		avatarPhotoId: null,
		isDeceased: false,
		archivedAt: null,
		createdAt: 1,
		updatedAt: 1,
		...over
	};
}

function fakeDeps(
	visible: Contact[],
	people: SurnameListPerson[] = [],
	graph: Partial<KinshipGraph> = {}
) {
	const batches: {
		writes: readonly NameWrite[];
		audit: ActivityOf<'contact.renamed' | 'lastNames.given'> | null;
	}[] = [];
	const dismissed: NewSurnameDismissal[] = [];
	const restored: { contactId: string; folded: string }[] = [];
	return {
		batches,
		dismissed,
		restored,
		deps: {
			names: {
				findByIdVisibleTo: async (_v: unknown, id: string) =>
					visible.find((c) => c.id === id) ?? null,
				writeNames: async (
					writes: readonly NameWrite[],
					audit: ActivityOf<'contact.renamed' | 'lastNames.given'> | null
				) => {
					batches.push({ writes, audit });
				}
			},
			surnames: { loadSurnameFactsVisibleTo: async () => ({ people, familyCircles: [] }) },
			kinship: inMemoryKinshipGraph({
				people: people.map((p) => ({ id: p.id, displayName: p.displayName })),
				...graph
			}),
			surnameDismissals: {
				listForHousehold: async () =>
					dismissed.map(({ contactId, folded }) => ({ contactId, folded })),
				dismiss: async (entry: NewSurnameDismissal) => {
					dismissed.push(entry);
				},
				restore: async (_v: unknown, contactId: string, folded: string) => {
					restored.push({ contactId, folded });
					return true;
				}
			},
			ids: { next: () => 'id-1' },
			clock: { now: () => NOW }
		}
	};
}

const lea = contact('lea', 'Lea', null);
const max = contact('max', 'Max', null);

describe('setLastNames', () => {
	it('writes every change in one batch with one log entry, the shown names following', async () => {
		const f = fakeDeps([lea, max]);

		const written = await setLastNames(
			f.deps,
			viewer,
			[
				{ contactId: 'lea', lastName: ' Brunner ', replace: false },
				{ contactId: 'max', lastName: 'Brunner', replace: false }
			],
			'de'
		);

		expect(written).toBe(2);
		expect(f.batches).toHaveLength(1);
		expect(f.batches[0]?.writes.map((w) => [w.id, w.displayName, w.lastName])).toEqual([
			['lea', 'Lea Brunner', 'Brunner'],
			['max', 'Max Brunner', 'Brunner']
		]);
		// A given last name ends *no last name* (§2.2.4.2) in the same write.
		expect(f.batches[0]?.writes.map((w) => w.withoutLastNameAt)).toEqual([null, null]);
		expect(f.batches[0]?.audit).toMatchObject({
			actorId: 'user-1',
			event: {
				kind: 'lastNames.given',
				firstContactId: 'lea',
				lastNames: 'Brunner',
				count: 2,
				visibility: 'shared'
			}
		});
	});

	it('logs a batch touching a private person as private', async () => {
		const f = fakeDeps([lea, { ...max, visibility: 'private' }]);

		await setLastNames(
			f.deps,
			viewer,
			[
				{ contactId: 'lea', lastName: 'Brunner', replace: false },
				{ contactId: 'max', lastName: 'Brunner', replace: false }
			],
			'de'
		);

		expect(f.batches[0]?.audit?.event.visibility).toBe('private');
	});

	it('refuses an empty name and writes nothing', async () => {
		const f = fakeDeps([lea]);

		await expect(
			setLastNames(f.deps, viewer, [{ contactId: 'lea', lastName: '  ', replace: false }], 'de')
		).rejects.toThrow(EmptyLastNameError);
		expect(f.batches).toEqual([]);
	});

	it('fails the whole batch when one person is not visible', async () => {
		const f = fakeDeps([lea]);

		const written = await setLastNames(
			f.deps,
			viewer,
			[
				{ contactId: 'lea', lastName: 'Brunner', replace: false },
				{ contactId: 'hidden', lastName: 'Brunner', replace: false }
			],
			'de'
		);

		expect(written).toBeNull();
		expect(f.batches).toEqual([]);
	});

	it('never overwrites a different last name unless asked to', async () => {
		const anna = contact('anna', 'Anna', 'Meier');
		const refused = fakeDeps([anna]);
		const asked = fakeDeps([anna]);

		await expect(
			setLastNames(
				refused.deps,
				viewer,
				[{ contactId: 'anna', lastName: 'Brunner', replace: false }],
				'de'
			)
		).rejects.toThrow(LastNameWouldOverwriteError);
		await setLastNames(
			asked.deps,
			viewer,
			[{ contactId: 'anna', lastName: 'Brunner', replace: true }],
			'de'
		);

		expect(refused.batches).toEqual([]);
		expect(asked.batches[0]?.writes[0]).toMatchObject({ lastName: 'Brunner', formerName: null });
	});

	it('leaves alone someone who already carries the name, and counts only the rest', async () => {
		const sophie = contact('sophie', 'Sophie', 'Brünner');
		const f = fakeDeps([lea, sophie]);

		const written = await setLastNames(
			f.deps,
			viewer,
			[
				{ contactId: 'lea', lastName: 'Brunner', replace: false },
				{ contactId: 'sophie', lastName: 'Brunner', replace: false }
			],
			'de'
		);

		expect(written).toBe(1);
		expect(f.batches[0]?.writes.map((w) => w.id)).toEqual(['lea']);
		expect(f.batches[0]?.audit?.event).toMatchObject({ lastNames: 'Brunner', count: 1 });
	});

	it('writes nothing at all when nobody needs the name', async () => {
		const sophie = contact('sophie', 'Sophie', 'Brunner');
		const f = fakeDeps([sophie]);

		expect(
			await setLastNames(
				f.deps,
				viewer,
				[{ contactId: 'sophie', lastName: 'Brunner', replace: false }],
				'de'
			)
		).toBe(0);
		expect(f.batches).toEqual([]);
	});
});

describe('reviewLastNames', () => {
	const listed = (
		id: string,
		first: string,
		last: string | null,
		over: Partial<SurnameListPerson> = {}
	): SurnameListPerson => ({
		id,
		displayName: last ? `${first} ${last}` : first,
		firstName: first,
		lastName: last,
		nickname: null,
		formerName: null,
		avatarPhotoId: null,
		isDeceased: false,
		archived: false,
		withoutLastNameAt: null,
		...over
	});

	it('lists the browsable people without a last name, the deceased included', async () => {
		const f = fakeDeps(
			[],
			[
				listed('peter', 'Peter', 'Brunner'),
				listed('lea', 'Lea', null),
				listed('oma', 'Oma', null, { isDeceased: true }),
				listed('old', 'Old', null, { archived: true })
			],
			{ parentEdges: [{ parentId: 'peter', childId: 'lea' }] }
		);

		const review = await reviewLastNames(f.deps, viewer);

		expect(review.list.groups.map((g) => [g.name, g.rows.map((r) => r.personId)])).toEqual([
			['Brunner', ['lea']]
		]);
		expect(review.list.none).toEqual(['oma']);
		expect(Object.keys(review.people).sort()).toEqual(['lea', 'oma']);
		expect(review.knownSurnames).toEqual(['Brunner']);
	});

	it('lists the names the household declined, for the people the viewer may see', async () => {
		const f = fakeDeps([lea], [listed('peter', 'Peter', 'Brunner'), listed('lea', 'Lea', null)], {
			parentEdges: [{ parentId: 'peter', childId: 'lea' }]
		});
		await dismissLastName(f.deps, viewer, 'lea', 'Brunner');
		f.dismissed.push({ ...f.dismissed[0]!, contactId: 'hidden' });

		const review = await reviewLastNames(f.deps, viewer);

		expect(review.declined).toEqual([{ contactId: 'lea', personName: 'Lea', name: 'Brunner' }]);
		expect(review.list.none).toEqual(['lea']);
	});

	it('puts a person settled as having no last name in the drawer, off the list', async () => {
		const f = fakeDeps(
			[],
			[
				listed('peter', 'Peter', 'Brunner'),
				listed('lea', 'Lea', null, { withoutLastNameAt: 5 }),
				listed('tom', 'Tom', null)
			],
			{ parentEdges: [{ parentId: 'peter', childId: 'lea' }] }
		);

		const review = await reviewLastNames(f.deps, viewer);

		expect(review.list.groups).toEqual([]);
		expect(review.list.none).toEqual(['tom']);
		expect(review.settled).toEqual([{ contactId: 'lea', personName: 'Lea' }]);
		expect(Object.keys(review.people)).toEqual(['tom']);
	});
});

describe('readSurnameHelp', () => {
	const listed = (
		id: string,
		last: string | null,
		over: Partial<SurnameListPerson> = {}
	): SurnameListPerson => ({
		id,
		displayName: id,
		firstName: id,
		lastName: last,
		nickname: null,
		formerName: null,
		avatarPhotoId: null,
		isDeceased: false,
		archived: false,
		withoutLastNameAt: null,
		...over
	});

	it('offers a name to the nameless children and siblings, one generation only', async () => {
		const f = fakeDeps(
			[lea],
			[
				listed('peter', 'Brunner'),
				listed('lea', null),
				listed('max', null),
				listed('sophie', 'Brunner'),
				listed('kid', null),
				listed('gone', null, { archived: true })
			],
			{
				parentEdges: [
					{ parentId: 'peter', childId: 'lea' },
					{ parentId: 'peter', childId: 'max' },
					{ parentId: 'peter', childId: 'sophie' },
					{ parentId: 'peter', childId: 'gone' },
					{ parentId: 'lea', childId: 'kid' }
				]
			}
		);
		await dismissLastName(f.deps, viewer, 'lea', 'Weber');

		const help = await readSurnameHelp(f.deps, viewer, 'lea');

		expect(help.passOn['peter']?.map((k) => k.id).sort()).toEqual(['lea', 'max']);
		expect(help.passOn['lea']).toEqual([
			{ id: 'kid', name: 'kid', declined: [] },
			{ id: 'max', name: 'max', declined: [] }
		]);
		expect(help.passOn['sophie']?.find((k) => k.id === 'lea')?.declined).toEqual(['weber']);
		expect(help.proposal).toMatchObject({ kind: 'one', name: 'Brunner' });
	});

	it('offers a settled person nothing: no chip on their profile, no pass-on', async () => {
		const f = fakeDeps(
			[],
			[
				listed('peter', 'Brunner'),
				listed('lea', null, { withoutLastNameAt: 5 }),
				listed('max', null)
			],
			{
				parentEdges: [
					{ parentId: 'peter', childId: 'lea' },
					{ parentId: 'peter', childId: 'max' }
				]
			}
		);

		const help = await readSurnameHelp(f.deps, viewer, 'lea');

		expect(help.proposal).toEqual({ kind: 'none' });
		expect(help.passOn['peter']?.map((k) => k.id)).toEqual(['max']);
		expect((await readSurnameHelp(f.deps, viewer, 'max')).proposal).toMatchObject({
			kind: 'one',
			name: 'Brunner'
		});
	});

	it('proposes nothing without a subject', async () => {
		const f = fakeDeps([], [listed('lea', null)]);
		expect((await readSurnameHelp(f.deps, viewer, null)).proposal).toEqual({ kind: 'none' });
	});
});

describe('countLastNames', () => {
	it('counts everyone listed, and those with a proposal', async () => {
		const person = (id: string, last: string | null) => ({
			id,
			displayName: id,
			firstName: id,
			lastName: last,
			nickname: null,
			formerName: null,
			avatarPhotoId: null,
			isDeceased: false,
			archived: false,
			withoutLastNameAt: null as number | null
		});
		const f = fakeDeps([], [person('peter', 'Brunner'), person('lea', null), person('tom', null)], {
			parentEdges: [{ parentId: 'peter', childId: 'lea' }]
		});

		expect(await countLastNames(f.deps, viewer)).toEqual({ missing: 2, suggested: 1 });
	});

	it('leaves out everyone settled as having no last name', async () => {
		const person = (id: string, last: string | null, withoutLastNameAt: number | null = null) => ({
			id,
			displayName: id,
			firstName: id,
			lastName: last,
			nickname: null,
			formerName: null,
			avatarPhotoId: null,
			isDeceased: false,
			archived: false,
			withoutLastNameAt
		});
		const f = fakeDeps(
			[],
			[
				person('peter', 'Brunner'),
				person('lea', null, 5),
				person('tom', null),
				person('ida', null, 6)
			],
			{ parentEdges: [{ parentId: 'peter', childId: 'lea' }] }
		);

		expect(await countLastNames(f.deps, viewer)).toEqual({ missing: 1, suggested: 0 });
	});
});

describe('dismissLastName / restoreLastName', () => {
	it('remembers the household’s *no* for this person and this name, folded', async () => {
		const f = fakeDeps([lea]);

		expect(await dismissLastName(f.deps, viewer, 'lea', 'Brünner')).toBe(true);

		expect(f.dismissed).toEqual([
			{
				id: 'id-1',
				householdId: 'household-1',
				contactId: 'lea',
				folded: 'brunner',
				dismissedBy: 'user-1',
				dismissedAt: NOW
			}
		]);
	});

	it('writes nothing for a person the viewer may not see', async () => {
		const f = fakeDeps([]);
		const visible = fakeDeps([lea]);

		expect(await dismissLastName(f.deps, viewer, 'lea', 'Brunner')).toBe(false);
		await dismissLastName(visible.deps, viewer, 'lea', 'Brunner');

		expect(f.dismissed).toEqual([]);
		expect(visible.dismissed).toHaveLength(1);
	});

	it('takes the *no* back', async () => {
		const f = fakeDeps([lea]);

		await restoreLastName(f.deps, viewer, 'lea', 'Brunner');

		expect(f.restored).toEqual([{ contactId: 'lea', folded: 'brunner' }]);
	});
});
