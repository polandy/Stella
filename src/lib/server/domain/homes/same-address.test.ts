import { describe, expect, it } from 'bun:test';
import { sameAddressKey } from '../../../people/same-address-check';
import type { Viewer } from '../../access/visibility';
import { fixedClock, sequentialIds } from '../testing';
import { homeRepositoryWith, type HomeWorld } from '../testing/homes';
import { HomeGoneError } from './homes';
import {
	askAgainSameAddress,
	checkSameAddresses,
	declineSameAddress,
	makeOneHome,
	type SameAddressDeps
} from './same-address';

/*
 * *Data quality → Same address* (docs/02 §2.17): making one home of the people found, joining
 * the home that has the line, and *Not the same* — never for anyone the viewer may not see,
 * and never from a screen gone stale.
 */

const viewer: Viewer = { id: 'u-1', householdId: 'h-1' };
const NOW = 1_000;
const names: Record<string, string> = {
	lea: 'Lea Widmer',
	reto: 'Reto Widmer',
	anna: 'Anna Brunner',
	jonas: 'Jonas Brunner',
	ruth: 'Ruth (private)'
};

const field = (id: string, contactId: string, value: string, label: string | null = null) => ({
	id,
	contactId,
	kind: 'address' as const,
	label,
	value,
	meta: null
});

const aHome = (id: string, value: string) => ({
	id,
	householdId: 'h-1',
	label: null,
	value,
	meta: null,
	createdBy: 'u-1',
	createdAt: 0,
	updatedAt: 0
});

function depsOver(world: Partial<HomeWorld>, seen = ['lea', 'reto', 'anna', 'jonas']) {
	const visible = new Set(seen);
	const homes = homeRepositoryWith({ homes: [], members: [], fields: [], ...world }, visible);
	const keys: string[] = [];
	const person = (id: string) => ({ id, displayName: names[id]! });
	const deps: SameAddressDeps = {
		sameAddress: {
			loadVisibleTo: async () => {
				const w = homes.world;
				return {
					people: seen.map(person),
					ownLines: w.fields
						.filter((f) => f.kind === 'address' && visible.has(f.contactId))
						.map((f) => ({
							contactId: f.contactId,
							fieldId: f.id,
							value: f.value,
							label: f.label,
							meta: f.meta
						})),
					homes: w.homes
						.map((h) => ({
							id: h.id,
							value: h.value,
							livesHere: w.members
								.filter((m) => m.homeId === h.id && visible.has(m.contactId))
								.map((m) => person(m.contactId))
						}))
						.filter((h) => h.livesHere.length > 0)
				};
			}
		},
		dismissals: {
			listForHousehold: async () => [...keys],
			dismiss: async (entry) => {
				if (!keys.includes(entry.key)) keys.push(entry.key);
			},
			restore: async (_v, key) => {
				const at = keys.indexOf(key);
				if (at < 0) return false;
				keys.splice(at, 1);
				return true;
			}
		},
		homes,
		ids: sequentialIds('home-new', 'dismissal-1', 'dismissal-2'),
		clock: fixedClock(NOW)
	};
	return { deps, world: homes.world, keys };
}

const membersOf = (world: HomeWorld, homeId: string) =>
	world.members
		.filter((m) => m.homeId === homeId)
		.map((m) => m.contactId)
		.sort();

const widmers = [
	field('f-lea', 'lea', 'Seestrasse 12, 8002 Zürich', 'Home'),
	field('f-reto', 'reto', 'seestrasse 12 · 8002 zürich')
];
const SEESTRASSE = 'seestrasse 12 8002 zürich';

describe('makeOneHome', () => {
	it('makes the first person’s line one home, and the own lines go', async () => {
		const { deps, world } = depsOver({ fields: [...widmers] });
		const made = await makeOneHome(deps, viewer, {
			folded: SEESTRASSE,
			contactIds: ['lea', 'reto'],
			homeId: null
		});
		expect(made).toEqual({ homeId: 'home-new', moved: 2 });
		expect(world.homes).toEqual([
			{
				...aHome('home-new', 'Seestrasse 12, 8002 Zürich'),
				label: 'Home',
				createdAt: NOW,
				updatedAt: NOW
			}
		]);
		expect(membersOf(world, 'home-new')).toEqual(['lea', 'reto']);
		expect(world.fields).toEqual([]);
	});

	it('joins the home that has the line, and someone already in it only loses the copy', async () => {
		const { deps, world } = depsOver({
			homes: [aHome('h-lind', 'Lindenweg 4')],
			members: [{ homeId: 'h-lind', contactId: 'anna' }],
			fields: [
				field('f-jonas', 'jonas', 'lindenweg 4'),
				field('f-anna', 'anna', 'Lindenweg 4.'),
				field('f-other', 'jonas', 'Bahnhofstrasse 1')
			]
		});
		const made = await makeOneHome(deps, viewer, {
			folded: 'lindenweg 4',
			contactIds: ['anna', 'jonas'],
			homeId: 'h-lind'
		});
		expect(made).toEqual({ homeId: 'h-lind', moved: 1 });
		expect(membersOf(world, 'h-lind')).toEqual(['anna', 'jonas']);
		expect(world.fields.map((f) => f.id)).toEqual(['f-other']);
	});

	it('moves only the people shown, so someone found since is asked about next time', async () => {
		const { deps, world } = depsOver({
			fields: [...widmers, field('f-anna', 'anna', 'Seestrasse 12, 8002 Zürich')]
		});
		await makeOneHome(deps, viewer, {
			folded: SEESTRASSE,
			contactIds: ['lea', 'reto'],
			homeId: null
		});
		expect(membersOf(world, 'home-new')).toEqual(['lea', 'reto']);
		expect(world.fields.map((f) => f.id)).toEqual(['f-anna']);
	});

	it('never moves a private person the viewer may not see', async () => {
		const { deps, world } = depsOver({
			fields: [...widmers, field('f-ruth', 'ruth', 'Seestrasse 12, 8002 Zürich')]
		});
		await makeOneHome(deps, viewer, {
			folded: SEESTRASSE,
			contactIds: ['lea', 'reto', 'ruth'],
			homeId: null
		});
		expect(membersOf(world, 'home-new')).toEqual(['lea', 'reto']);
		expect(world.fields.map((f) => f.id)).toEqual(['f-ruth']);
	});

	it('refuses a screen gone stale: the line changed, too few left, or another home', async () => {
		const { deps, world } = depsOver({
			fields: [widmers[0]!, field('f-reto', 'reto', 'Elsewhere 1')]
		});
		const tryIt = (homeId: string | null, contactIds = ['lea', 'reto']) =>
			makeOneHome(deps, viewer, { folded: SEESTRASSE, contactIds, homeId });
		await expect(tryIt(null)).rejects.toBeInstanceOf(HomeGoneError);

		world.fields.push(field('f-reto-2', 'reto', 'Seestrasse 12, 8002 Zürich'));
		await expect(tryIt(null, ['lea'])).rejects.toBeInstanceOf(HomeGoneError);
		await expect(tryIt('h-gone')).rejects.toBeInstanceOf(HomeGoneError);
		expect(world.homes).toEqual([]);
	});
});

describe('Not the same', () => {
	it('is remembered for the people shown, and the check stops offering them', async () => {
		const { deps, keys } = depsOver({ fields: [...widmers] });
		await declineSameAddress(deps, viewer, { folded: SEESTRASSE, contactIds: ['reto', 'lea'] });
		expect(keys).toEqual([sameAddressKey(SEESTRASSE, ['lea', 'reto'])]);

		const check = await checkSameAddresses(deps, viewer);
		expect(check.open).toEqual([]);
		expect(check.declined.map((f) => f.line)).toEqual(['Seestrasse 12, 8002 Zürich']);
	});

	it('names only people who still have the line and whom the viewer may see', async () => {
		const { deps, keys } = depsOver({ fields: [...widmers] });
		await declineSameAddress(deps, viewer, {
			folded: SEESTRASSE,
			contactIds: ['lea', 'reto', 'ruth', 'anna']
		});
		expect(keys).toEqual([sameAddressKey(SEESTRASSE, ['lea', 'reto'])]);
		await expect(
			declineSameAddress(deps, viewer, { folded: 'nowhere 1', contactIds: ['lea'] })
		).rejects.toBeInstanceOf(HomeGoneError);
	});

	it('Ask again takes it back, and only an answer the viewer can see', async () => {
		const key = sameAddressKey(SEESTRASSE, ['lea', 'reto']);
		const { deps, keys } = depsOver({ fields: [...widmers] });
		keys.push(key, sameAddressKey('other 1', ['ruth', 'x']));

		expect(await askAgainSameAddress(deps, viewer, sameAddressKey('other 1', ['ruth', 'x']))).toBe(
			false
		);
		expect(await askAgainSameAddress(deps, viewer, 'garbage')).toBe(false);
		expect(await askAgainSameAddress(deps, viewer, key)).toBe(true);
		expect((await checkSameAddresses(deps, viewer)).open).toHaveLength(1);
	});
});
