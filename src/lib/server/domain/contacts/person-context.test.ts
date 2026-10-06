import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import {
	contextOfPeople,
	type ContextMembershipRow,
	type ContextTieRow,
	type PersonContextReads
} from './person-context';

/*
 * What a namesake's second line may fall back on (docs/02 §2.2.3): only asked for people with
 * nothing typed to tell them apart, read through reads the adapter scopes to the viewer, and
 * ranked by the pure `rankContext`. Tested with a recording fake (docs/08 §8.3).
 */

const viewer: Viewer = { id: 'u-andy', householdId: 'h1' };
const TODAY = '2026-09-29';

const tieRow = (
	contactId: string,
	otherId: string,
	otherName: string,
	extra: Partial<ContextTieRow> = {}
): ContextTieRow => ({
	contactId,
	typeKey: 'sibling',
	side: 'forward',
	label: 'Sibling of',
	otherId,
	otherName,
	category: 'family',
	sortOrder: 30,
	status: 'current',
	createdAt: 1,
	...extra
});

const membershipRow = (
	contactId: string,
	name: string,
	role: string | null = null
): ContextMembershipRow => ({
	contactId,
	circleId: name.toLowerCase(),
	parentCircleId: null,
	name,
	role,
	startDate: null,
	endDate: null
});

function fakeReads(ties: ContextTieRow[], memberships: ContextMembershipRow[]) {
	const asked: { viewer: Viewer; ids: readonly string[] }[] = [];
	const reads: PersonContextReads = {
		async listTiesOfVisibleTo(v, ids) {
			asked.push({ viewer: v, ids });
			return ties.filter((t) => ids.includes(t.contactId));
		},
		async listMembershipsOfVisibleTo(v, ids) {
			asked.push({ viewer: v, ids });
			return memberships.filter((m) => ids.includes(m.contactId));
		}
	};
	return { reads, asked };
}

describe('contextOfPeople', () => {
	it('asks only about people with nothing typed to tell them apart, as the viewer', async () => {
		const { reads, asked } = fakeReads(
			[tieRow('t1', 's1', 'Sabine Keller'), tieRow('t2', 's1', 'Sabine Keller')],
			[]
		);
		const context = await contextOfPeople({ contextReads: reads }, viewer, {
			people: [
				{ id: 't1', displayName: 'Thomas' },
				{ id: 't2', displayName: 'Thomas', description: 'Plumber' }
			],
			selfContactId: null,
			today: TODAY
		});
		expect(asked.map((a) => a.ids)).toEqual([['t1'], ['t1']]);
		expect(asked.every((a) => a.viewer === viewer)).toBe(true);
		expect(Object.keys(context)).toEqual(['t1']);
		expect(context.t1?.ties.map((t) => t.otherName)).toEqual(['Sabine Keller']);
	});

	it("marks a link to the viewer's own person, and names each person's circle", async () => {
		const { reads } = fakeReads(
			[
				tieRow('t1', 'me', 'Andy Brunner'),
				tieRow('t1', 's1', 'Sabine Keller', { category: 'social' })
			],
			[membershipRow('t2', 'Turnverein', 'Coach')]
		);
		const context = await contextOfPeople({ contextReads: reads }, viewer, {
			people: [
				{ id: 't1', displayName: 'Thomas' },
				{ id: 't2', displayName: 'Thomas' },
				{ id: 't3', displayName: 'Thomas' }
			],
			selfContactId: 'me',
			today: TODAY
		});
		expect(context.t1?.ties.map((t) => [t.otherName, t.otherIsViewer])).toEqual([
			['Andy Brunner', true],
			['Sabine Keller', false]
		]);
		expect(context.t2).toEqual({ ties: [], circle: { name: 'Turnverein', role: 'Coach' } });
		expect('t3' in context).toBe(false);
	});

	it('reads nothing when everyone has something typed', async () => {
		const { reads, asked } = fakeReads([], []);
		const context = await contextOfPeople({ contextReads: reads }, viewer, {
			people: [{ id: 't1', displayName: 'Thomas', metPlace: 'Zermatt' }],
			selfContactId: null,
			today: TODAY
		});
		expect(asked).toEqual([]);
		expect(context).toEqual({});
	});
});
