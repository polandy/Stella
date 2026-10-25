import { describe, expect, it } from 'bun:test';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import type { HouseholdSnapshot } from './archive';
import { buildArchiveDocument } from './document';
import { planRestore, type RestoreTarget } from './restore';

/*
 * A shared home through an archive and back (docs/02 §2.15, docs/03 §3.3): the address with
 * whoever lives there, and nothing of it that nobody in the archive could reach again.
 */

const clock: Clock = { now: () => Date.UTC(2026, 9, 1, 8, 0) };
const CREATED = Date.UTC(2026, 5, 1);

function counter(): IdGenerator {
	let n = 0;
	return { next: () => `new-${++n}` };
}

const target: RestoreTarget = {
	householdId: 'h-here',
	actorId: 'u-admin',
	memberIds: ['u-admin', 'u-1'],
	relationshipTypeIds: [],
	symmetricTypeIds: [],
	tags: []
};

const snapshot: HouseholdSnapshot = {
	householdName: 'Familie Brunner',
	mediaPaths: [],
	tables: {
		contact: ['tim', 'anna'].map((id) => ({ id, display_name: id, created_by: 'u-1' })),
		home: [
			{
				id: 'home-1',
				label: 'Home',
				value: 'Lindenweg 4\n8800 Thalwil',
				meta: null,
				created_by: 'u-1',
				created_at: CREATED
			}
		],
		home_member: ['tim', 'anna'].map((contact_id) => ({ home_id: 'home-1', contact_id }))
	}
};

const tableOf = (plan: ReturnType<typeof planRestore>, name: string) =>
	plan.tables.find((t) => t.table === name)?.rows ?? [];

describe('a shared home in an archive', () => {
	it('is written once, with who lives there', () => {
		expect(buildArchiveDocument(snapshot, clock.now()).homes).toEqual([
			{
				id: 'home-1',
				label: 'Home',
				value: 'Lindenweg 4\n8800 Thalwil',
				author: 'u-1',
				created_at: new Date(CREATED).toISOString(),
				members: ['tim', 'anna']
			}
		]);
	});

	it('comes back as the same home with the same people', () => {
		const document = buildArchiveDocument(snapshot, clock.now());
		const plan = planRestore({ ids: counter(), clock }, document, target);

		expect(tableOf(plan, 'home')).toEqual([
			{
				id: 'home-1',
				household_id: 'h-here',
				label: 'Home',
				value: 'Lindenweg 4\n8800 Thalwil',
				meta: null,
				created_by: 'u-1',
				created_at: CREATED,
				updated_at: CREATED
			}
		]);
		expect(tableOf(plan, 'home_member').map((m) => m.contact_id)).toEqual(['tim', 'anna']);
		expect(plan.warnings).toEqual([]);
		const order = plan.tables.map((t) => t.table);
		expect(order.indexOf('home')).toBeGreaterThan(order.indexOf('contact'));
		expect(order.indexOf('home_member')).toBe(order.indexOf('home') + 1);
	});

	it('keeps a home without the people the archive does not hold', () => {
		const document = {
			...buildArchiveDocument(snapshot, clock.now()),
			people: [{ id: 'tim', display_name: 'tim' }]
		};
		const plan = planRestore({ ids: counter(), clock }, document, target);

		expect(tableOf(plan, 'home_member').map((m) => m.contact_id)).toEqual(['tim']);
		expect(plan.warnings).toEqual([{ code: 'homeMembersMissing' }]);
	});

	it('leaves out a home nobody of the archive lives in, or one without its line', () => {
		const document = {
			...buildArchiveDocument(snapshot, clock.now()),
			people: [],
			homes: [
				{ id: 'home-1', value: 'Lindenweg 4', members: ['tim'] },
				{ id: 'home-2', members: [] }
			]
		};
		const plan = planRestore({ ids: counter(), clock }, document, target);

		expect(tableOf(plan, 'home')).toEqual([]);
		expect(plan.warnings).toEqual([{ code: 'homeMembersMissing' }, { code: 'homeIncomplete' }]);
	});

	it('reads an archive from before homes as having none', () => {
		const { homes: _none, ...older } = buildArchiveDocument(snapshot, clock.now());
		const plan = planRestore({ ids: counter(), clock }, older, target);

		expect(tableOf(plan, 'home')).toEqual([]);
		expect(plan.warnings).toEqual([]);
	});
});
