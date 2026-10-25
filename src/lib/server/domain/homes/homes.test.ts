import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import type { Contact } from '../../db/schema';
import { ContactGoneError } from '../contacts/require-visible';
import { fixedClock, sequentialIds } from '../testing';
import { homeRepositoryWith, type HomeWorld } from '../testing/homes';
import {
	changeHomeLine,
	HomeGoneError,
	leaveHome,
	shareAddress,
	type HomeDeps
} from './homes';

/*
 * The shared home (docs/02 §2.2, *A shared home*): sharing an address, rewriting it for
 * everyone or one person, moving out — and the members the viewer may not see, who are never
 * moved by someone who cannot see them.
 */

const viewer: Viewer = { id: 'u-1', householdId: 'h-1' };
const NOW = 1_000;

function depsOver(world: Partial<HomeWorld>, seen: string[] = ['tim', 'anna', 'peter', 'ruth']) {
	const homes = homeRepositoryWith(
		{ homes: [], members: [], fields: [], ...world },
		new Set(seen)
	);
	const deps: HomeDeps = {
		homes,
		contacts: {
			findByIdVisibleTo: async (_v, id) => (seen.includes(id) ? ({ id } as Contact) : null)
		},
		ids: sequentialIds('home-new', 'field-new', 'field-new-2'),
		clock: fixedClock(NOW)
	};
	return { deps, world: homes.world };
}

const address = (id: string, contactId: string, value: string, label: string | null = null) => ({
	id,
	contactId,
	kind: 'address' as const,
	label,
	value,
	meta: null
});

const aHome = (id: string, value: string, label: string | null = null) => ({
	id,
	householdId: 'h-1',
	label,
	value,
	meta: null,
	createdBy: 'u-1',
	createdAt: 0,
	updatedAt: 0
});

const livesIn = (homeId: string, ...contactIds: string[]) =>
	contactIds.map((contactId) => ({ homeId, contactId }));

const membersOf = (world: HomeWorld, homeId: string) =>
	world.members
		.filter((m) => m.homeId === homeId)
		.map((m) => m.contactId)
		.sort();

describe('shareAddress', () => {
	it('turns an own address into a home the picked people move into', async () => {
		const { deps, world } = depsOver({
			fields: [address('f-tim', 'tim', 'Lindenweg 4\n8800 Thalwil', 'Home')]
		});

		const outcome = await shareAddress(deps, viewer, {
			contactId: 'tim',
			address: { field: 'f-tim' },
			withIds: ['anna', 'peter'],
			replace: null
		});

		expect(outcome).toEqual({ status: 'shared', homeId: 'home-new', joined: 2 });
		expect(world.homes).toEqual([
			{ ...aHome('home-new', 'Lindenweg 4\n8800 Thalwil', 'Home'), createdAt: NOW, updatedAt: NOW }
		]);
		expect(membersOf(world, 'home-new')).toEqual(['anna', 'peter', 'tim']);
		expect(world.fields).toEqual([]);
	});

	it('lets a same line someone already has give way without asking', async () => {
		const { deps, world } = depsOver({
			fields: [
				address('f-tim', 'tim', 'Lindenweg 4, 8800 Thalwil'),
				address('f-anna', 'anna', 'lindenweg 4\n8800 thalwil'),
				address('f-anna-work', 'anna', 'Lindenweg 4, 8800 Thalwil', 'Work')
			]
		});

		const outcome = await shareAddress(deps, viewer, {
			contactId: 'tim',
			address: { field: 'f-tim' },
			withIds: ['anna'],
			replace: null
		});

		expect(outcome.status).toBe('shared');
		expect(world.fields).toEqual([]);
	});

	it('asks about a different address before anything is written', async () => {
		const { deps, world } = depsOver({
			homes: [aHome('home-ruth', 'Seestrasse 1')],
			members: livesIn('home-ruth', 'ruth'),
			fields: [
				address('f-tim', 'tim', 'Lindenweg 4'),
				address('f-ruth', 'ruth', 'Dorfstrasse 12')
			]
		});

		const outcome = await shareAddress(deps, viewer, {
			contactId: 'tim',
			address: { field: 'f-tim' },
			withIds: ['ruth'],
			replace: null
		});

		expect(outcome).toEqual({
			status: 'decide',
			addresses: [
				{ contactId: 'ruth', id: 'f-ruth', value: 'Dorfstrasse 12' },
				{ contactId: 'ruth', id: 'home-ruth', value: 'Seestrasse 1' }
			]
		});
		expect(world.fields).toHaveLength(2);
		expect(world.homes.map((h) => h.id)).toEqual(['home-ruth']);
	});

	it('then replaces what was ticked and keeps the rest as theirs', async () => {
		const { deps, world } = depsOver({
			homes: [aHome('home-ruth', 'Seestrasse 1')],
			members: livesIn('home-ruth', 'ruth'),
			fields: [
				address('f-tim', 'tim', 'Lindenweg 4'),
				address('f-ruth', 'ruth', 'Dorfstrasse 12')
			]
		});

		await shareAddress(deps, viewer, {
			contactId: 'tim',
			address: { field: 'f-tim' },
			withIds: ['ruth'],
			replace: ['home-ruth']
		});

		expect(world.fields.map((f) => f.id)).toEqual(['f-ruth']);
		// Ruth was the last one in her old home, so it went with her.
		expect(world.homes.map((h) => h.id)).toEqual(['home-new']);
		expect(membersOf(world, 'home-new')).toEqual(['ruth', 'tim']);
	});

	it('adds people to a home the person already lives in', async () => {
		const { deps, world } = depsOver({
			homes: [aHome('home-1', 'Lindenweg 4')],
			members: livesIn('home-1', 'tim', 'anna')
		});

		const outcome = await shareAddress(deps, viewer, {
			contactId: 'tim',
			address: { home: 'home-1' },
			withIds: ['anna', 'peter', 'tim'],
			replace: null
		});

		expect(outcome).toEqual({ status: 'shared', homeId: 'home-1', joined: 1 });
		expect(membersOf(world, 'home-1')).toEqual(['anna', 'peter', 'tim']);
	});

	it('refuses someone the viewer may not see', async () => {
		const { deps } = depsOver({ fields: [address('f-tim', 'tim', 'Lindenweg 4')] });

		expect(
			shareAddress(deps, viewer, {
				contactId: 'tim',
				address: { field: 'f-tim' },
				withIds: ['lena'],
				replace: null
			})
		).rejects.toBeInstanceOf(ContactGoneError);
	});

	it('refuses an address that is no longer theirs', async () => {
		const { deps } = depsOver({ fields: [address('f-anna', 'anna', 'Lindenweg 4')] });

		expect(
			shareAddress(deps, viewer, {
				contactId: 'tim',
				address: { field: 'f-anna' },
				withIds: ['peter'],
				replace: null
			})
		).rejects.toBeInstanceOf(HomeGoneError);
	});
});

describe('changeHomeLine', () => {
	const world = () => ({
		homes: [aHome('home-1', 'Lindenweg 4', 'Home')],
		members: livesIn('home-1', 'tim', 'anna', 'peter')
	});

	it('rewrites the line for everyone who lives there', async () => {
		const { deps, world: after } = depsOver(world());

		const outcome = await changeHomeLine(deps, viewer, {
			contactId: 'tim',
			homeId: 'home-1',
			label: 'Home',
			value: ' Seeweg 9 ',
			scope: 'everyone'
		});

		expect(outcome).toEqual({ changedFor: 3 });
		expect(after.homes[0]).toMatchObject({ value: 'Seeweg 9', label: 'Home' });
		expect(membersOf(after, 'home-1')).toEqual(['anna', 'peter', 'tim']);
	});

	it('moves only this person out, with the new line as their own', async () => {
		const { deps, world: after } = depsOver(world());

		const outcome = await changeHomeLine(deps, viewer, {
			contactId: 'tim',
			homeId: 'home-1',
			label: '',
			value: 'Bahnhofstrasse 3',
			scope: 'only'
		});

		expect(outcome).toEqual({ changedFor: 1 });
		expect(after.homes[0]).toMatchObject({ value: 'Lindenweg 4' });
		expect(membersOf(after, 'home-1')).toEqual(['anna', 'peter']);
		expect(after.fields).toEqual([
			{
				...address('home-new', 'tim', 'Bahnhofstrasse 3'),
				sortOrder: 0,
				createdAt: NOW,
				updatedAt: NOW
			}
		]);
	});

	it('rewrites the home itself when nobody else lives there, whatever was chosen', async () => {
		const { deps, world: after } = depsOver({
			homes: [aHome('home-1', 'Lindenweg 4')],
			members: livesIn('home-1', 'tim')
		});

		await changeHomeLine(deps, viewer, {
			contactId: 'tim',
			homeId: 'home-1',
			label: null,
			value: 'Seeweg 9',
			scope: 'only'
		});

		expect(after.homes[0]).toMatchObject({ value: 'Seeweg 9' });
		expect(after.fields).toEqual([]);
	});

	it('leaves a member the viewer may not see on the old line, as their own address', async () => {
		const { deps, world: after } = depsOver(
			{ homes: [aHome('home-1', 'Lindenweg 4', 'Home')], members: livesIn('home-1', 'tim', 'anna', 'lena') },
			['tim', 'anna']
		);

		const outcome = await changeHomeLine(deps, viewer, {
			contactId: 'tim',
			homeId: 'home-1',
			label: 'Home',
			value: 'Seeweg 9',
			scope: 'everyone'
		});

		expect(outcome).toEqual({ changedFor: 2 });
		expect(membersOf(after, 'home-1')).toEqual(['anna', 'tim']);
		expect(after.fields).toEqual([
			{
				...address('home-new', 'lena', 'Lindenweg 4', 'Home'),
				sortOrder: 0,
				createdAt: NOW,
				updatedAt: NOW
			}
		]);
	});

	it('refuses a home the person does not live in', async () => {
		const { deps } = depsOver(world());

		expect(
			changeHomeLine(deps, viewer, {
				contactId: 'ruth',
				homeId: 'home-1',
				label: null,
				value: 'Seeweg 9',
				scope: 'everyone'
			})
		).rejects.toBeInstanceOf(HomeGoneError);
	});
});

describe('leaveHome', () => {
	it('moves one person out and leaves everyone else in', async () => {
		const { deps, world } = depsOver({
			homes: [aHome('home-1', 'Lindenweg 4')],
			members: livesIn('home-1', 'tim', 'anna')
		});

		await leaveHome(deps, viewer, { contactId: 'anna', homeId: 'home-1' });

		expect(membersOf(world, 'home-1')).toEqual(['tim']);
	});

	it('takes the home with its last member, and a second leave changes nothing', async () => {
		const { deps, world } = depsOver({
			homes: [aHome('home-1', 'Lindenweg 4')],
			members: livesIn('home-1', 'tim')
		});

		await leaveHome(deps, viewer, { contactId: 'tim', homeId: 'home-1' });
		await leaveHome(deps, viewer, { contactId: 'tim', homeId: 'home-1' });

		expect(world.homes).toEqual([]);
	});

	it('refuses someone the viewer may not see', async () => {
		const { deps } = depsOver({});

		expect(leaveHome(deps, viewer, { contactId: 'lena', homeId: 'home-1' })).rejects.toBeInstanceOf(
			ContactGoneError
		);
	});
});
