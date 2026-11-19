import { describe, expect, it } from 'bun:test';
import type { RestoreContext, RestoreWarning } from './restore-context';
import { planRowsOf } from './restore-plans';

/*
 * A person's outing ideas out of an archive (docs/dev/02 §2.27, §2.15): what does not read is
 * dropped with a warning, or only the part that does not read is.
 */

function context(): { ctx: RestoreContext; warnings: RestoreWarning[] } {
	const warnings: RestoreWarning[] = [];
	let n = 0;
	const ctx: RestoreContext = {
		householdId: 'h1',
		ids: { next: () => `new-${++n}` },
		now: 1_000,
		members: new Set(['u1']),
		author: () => 'u1',
		stamps: () => ({ created_at: 1_000, updated_at: 1_000 }),
		warn: (warning) => warnings.push(warning)
	};
	return { ctx, warnings };
}

describe('planRowsOf', () => {
	it('drops an idea without its line, warns, and keeps the next one', () => {
		const { ctx, warnings } = context();
		const person = {
			plans: [
				{ id: 'p-1', note: 'no title' },
				{ id: 'p-2', title: 'Zoo' }
			]
		};

		const rows = planRowsOf(person, 'c1', new Set(), ctx);

		expect(rows.map((row) => row.id)).toEqual(['p-2']);
		expect(warnings).toEqual([{ code: 'planIncomplete' }]);
	});

	it('keeps an idea whose link, when, moment and member do not read, without them', () => {
		const { ctx, warnings } = context();
		const person = {
			plans: [
				{
					id: 'p-1',
					title: 'Zoo',
					url: 'javascript:alert(1)',
					when_kind: 'age',
					when_age: 7,
					moment_id: 'e-not-restored',
					booked_at: '2026-05-01T10:00:00.000Z',
					booked_by: 'u-elsewhere'
				}
			]
		};

		const [row] = planRowsOf(person, 'c1', new Set(), ctx);

		expect(row).toMatchObject({
			title: 'Zoo',
			url: null,
			when_kind: null,
			moment_id: null,
			// Still booked, by nobody here.
			booked_at: Date.parse('2026-05-01T10:00:00.000Z'),
			booked_by: null
		});
		expect(warnings).toEqual([]);
	});
});
