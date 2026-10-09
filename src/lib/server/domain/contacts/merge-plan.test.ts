import { describe, expect, it } from 'bun:test';
import { MERGE_PLAN, type MergeSettlement, type MergeStep } from './merge-plan';

/*
 * The order a merge walks the tables that point at a person, and what it does where the
 * survivor already has the row (docs/02 §2.2). The adapter only runs this list; the rules
 * that make it safe to run are the ones below.
 */

const position = (match: (step: MergeStep) => boolean): number => {
	const at = MERGE_PLAN.findIndex(match);
	if (at === -1) throw new Error('no such step in the merge plan');
	return at;
};
const repointOf = (table: string, column = 'contact_id') =>
	position((step) => step.kind === 'repoint' && step.table === table && step.column === column);
const settling = (settle: MergeSettlement) =>
	position((step) => step.kind === 'settle' && step.settle === settle);

describe('the merge plan', () => {
	it('repoints every column once', () => {
		const columns = MERGE_PLAN.flatMap((step) =>
			step.kind === 'repoint' ? [`${step.table}.${step.column}`] : []
		);
		expect(new Set(columns).size).toBe(columns.length);
	});

	it('runs every settlement once', () => {
		const settlements = MERGE_PLAN.flatMap((step) => (step.kind === 'settle' ? [step.settle] : []));
		expect(new Set(settlements).size).toBe(settlements.length);
	});

	it('turns the merged record’s cuts into photos before their photos move', () => {
		expect(settling('turn-merged-cuts')).toBeLessThan(repointOf('photo'));
	});

	it('joins two entries about the same day before the journal moves, which then cannot collide', () => {
		expect(settling('join-journal-days')).toBeLessThan(repointOf('journal_entry'));
		expect(MERGE_PLAN[repointOf('journal_entry')]).toMatchObject({ onConflict: 'cannot-collide' });
	});

	it('drops a membership the survivor already has before the memberships move', () => {
		expect(settling('drop-memberships-survivor-has')).toBeLessThan(repointOf('circle_membership'));
		expect(MERGE_PLAN[repointOf('circle_membership')]).toMatchObject({
			onConflict: 'cannot-collide'
		});
	});

	it('drops the link between the two only once both ends of every link have moved', () => {
		const from = repointOf('relationship', 'from_contact_id');
		const to = repointOf('relationship', 'to_contact_id');
		expect(settling('drop-self-links')).toBeGreaterThan(Math.max(from, to));
		// A link the survivor already has of the same type stays the survivor's.
		expect(MERGE_PLAN[from]).toMatchObject({ onConflict: 'survivor-keeps' });
		expect(MERGE_PLAN[to]).toMatchObject({ onConflict: 'survivor-keeps' });
	});

	it('moves the links to third people in stored order before the columns are repointed', () => {
		// A plain repoint would leave a symmetric link unsorted (docs/03 §relationship).
		expect(settling('move-links-in-stored-order')).toBeLessThan(
			repointOf('relationship', 'from_contact_id')
		);
	});

	it('settles each table in the plan that the settlement names', () => {
		const tables = new Set(
			MERGE_PLAN.flatMap((step) => (step.kind === 'repoint' ? [step.table] : []))
		);
		for (const step of MERGE_PLAN) if (step.kind === 'settle') expect(tables).toContain(step.table);
	});
});
