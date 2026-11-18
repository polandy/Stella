import { describe, expect, it } from 'bun:test';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import type { HouseholdSnapshot } from './archive';
import { buildArchiveDocument } from './document';
import { planRestore, type RestoreTarget } from './restore';

/*
 * One idea for several people through an archive and back (docs/dev/02 §2.15, §2.25.11): the
 * group once, each gift pointing at it, and a gift whose group the archive lost kept on its own.
 */

const clock: Clock = { now: () => Date.UTC(2026, 10, 18, 8, 0) };
const CREATED = Date.UTC(2026, 10, 1);

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

const giftFor = (contact_id: string) => ({
	id: `g-${contact_id}`,
	contact_id,
	state: 'idea',
	title: 'Puzzle',
	when_kind: 'christmas_at_age',
	when_age: 6,
	visibility: 'shared',
	hidden_from_recipient: 1,
	group_id: 'gg-1',
	created_by: 'u-1',
	created_at: CREATED
});

const snapshot: HouseholdSnapshot = {
	householdName: 'Familie Brunner',
	mediaPaths: [],
	tables: {
		contact: ['mia', 'ben'].map((id) => ({ id, display_name: id, created_by: 'u-1' })),
		gift_group: [
			{
				id: 'gg-1',
				household_id: 'h-old',
				title: 'Puzzle',
				note: 'the big one',
				url: null,
				when_kind: 'christmas_at_age',
				when_on: null,
				when_age: 6,
				occasion: 'christmas',
				visibility: 'shared',
				hidden_from_recipients: 1,
				created_by: 'u-1',
				created_at: CREATED
			}
		],
		gift: [giftFor('mia'), giftFor('ben')]
	}
};

const tableOf = (plan: ReturnType<typeof planRestore>, name: string) =>
	plan.tables.find((t) => t.table === name)?.rows ?? [];

describe('one idea for several people in an archive', () => {
	it('is written once, and each gift names its group', () => {
		const document = buildArchiveDocument(snapshot, clock.now());
		expect(document.gift_groups).toEqual([
			{
				id: 'gg-1',
				title: 'Puzzle',
				note: 'the big one',
				when_kind: 'christmas_at_age',
				when_age: 6,
				occasion: 'christmas',
				visibility: 'shared',
				hidden_from_recipients: true,
				author: 'u-1',
				created_at: new Date(CREATED).toISOString()
			}
		]);
		const gifts = document.people.flatMap((p) => p.gifts as Record<string, unknown>[]);
		expect(gifts.map((g) => g.group)).toEqual(['gg-1', 'gg-1']);
	});

	it('comes back as the same group with the same gifts in it, before them', () => {
		const document = buildArchiveDocument(snapshot, clock.now());
		const plan = planRestore({ ids: counter(), clock }, document, target);

		expect(tableOf(plan, 'gift_group')).toEqual([
			{
				id: 'gg-1',
				household_id: 'h-here',
				created_by: 'u-1',
				title: 'Puzzle',
				note: 'the big one',
				url: null,
				when_kind: 'christmas_at_age',
				when_on: null,
				when_age: 6,
				occasion: 'christmas',
				visibility: 'shared',
				hidden_from_recipients: 1,
				created_at: CREATED,
				updated_at: CREATED
			}
		]);
		expect(tableOf(plan, 'gift').map((g) => [g.id, g.group_id])).toEqual([
			['g-mia', 'gg-1'],
			['g-ben', 'gg-1']
		]);
		expect(plan.warnings).toEqual([]);
		const order = plan.tables.map((t) => t.table);
		expect(order.indexOf('gift_group')).toBe(order.indexOf('gift') - 1);
	});

	it('keeps a gift whose group the archive lost, on its own, and says so', () => {
		const document = { ...buildArchiveDocument(snapshot, clock.now()), gift_groups: [] };
		const plan = planRestore({ ids: counter(), clock }, document, target);

		expect(tableOf(plan, 'gift').map((g) => g.group_id)).toEqual([null, null]);
		expect(plan.warnings).toEqual([{ code: 'giftGroupMissing' }]);
	});

	it('leaves out a group without a title, and one none of whose gifts came back', () => {
		const built = buildArchiveDocument(snapshot, clock.now());
		const document = {
			...built,
			people: built.people.map((p) => ({ ...p, gifts: [] })),
			gift_groups: [...built.gift_groups, { id: 'gg-2' }]
		};
		const plan = planRestore({ ids: counter(), clock }, document, target);

		expect(tableOf(plan, 'gift_group')).toEqual([]);
		expect(plan.warnings).toEqual([]);
	});

	it('never makes a private group a surprise', () => {
		const built = buildArchiveDocument(snapshot, clock.now());
		const document = {
			...built,
			gift_groups: built.gift_groups.map((g) => ({ ...g, visibility: 'private' }))
		};
		const plan = planRestore({ ids: counter(), clock }, document, target);

		expect(tableOf(plan, 'gift_group')[0]).toMatchObject({
			visibility: 'private',
			hidden_from_recipients: 0
		});
	});

	it('reads an archive from before groups as having none', () => {
		const { gift_groups: _none, ...built } = buildArchiveDocument(snapshot, clock.now());
		const ungrouped = (gifts: unknown) =>
			(gifts as Record<string, unknown>[]).map(({ group: _group, ...gift }) => gift);
		const older = {
			...built,
			people: built.people.map((p) => ({ ...p, gifts: ungrouped(p.gifts) }))
		};
		const plan = planRestore({ ids: counter(), clock }, older, target);

		expect(tableOf(plan, 'gift_group')).toEqual([]);
		expect(tableOf(plan, 'gift').map((g) => g.group_id)).toEqual([null, null]);
		expect(plan.warnings).toEqual([]);
	});
});
