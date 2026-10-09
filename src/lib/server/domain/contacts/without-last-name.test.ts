import { describe, expect, it } from 'bun:test';
import type { Contact } from './contacts';
import { askAgainForLastName, settleWithoutLastName } from './without-last-name';

/*
 * *No last name* on the Last names list (docs/02 §2.2.4.2): the household's answer that a
 * person has none, kept on the person, and *Ask again*, which takes it back.
 */

const NOW = 1_700_000_000_000;
const viewer = { id: 'user-1', householdId: 'household-1' };

const contact = (id: string, lastName: string | null) =>
	({ id, displayName: id, firstName: id, lastName }) as Contact;

function fakeDeps(visible: Contact[]) {
	const marks: { id: string; at: number | null }[] = [];
	return {
		marks,
		deps: {
			withoutLastName: {
				findByIdVisibleTo: async (_v: unknown, id: string) =>
					visible.find((c) => c.id === id) ?? null,
				markWithoutLastName: async (id: string, at: number | null) => {
					marks.push({ id, at });
				}
			},
			clock: { now: () => NOW }
		}
	};
}

describe('settleWithoutLastName', () => {
	it('marks a visible person without a last name as having none, now', async () => {
		const f = fakeDeps([contact('jonas', null)]);

		expect(await settleWithoutLastName(f.deps, viewer, 'jonas')).toBe(true);

		expect(f.marks).toEqual([{ id: 'jonas', at: NOW }]);
	});

	it('writes nothing for a person the viewer may not see', async () => {
		const f = fakeDeps([]);

		expect(await settleWithoutLastName(f.deps, viewer, 'jonas')).toBe(false);

		expect(f.marks).toEqual([]);
	});

	it('writes nothing for someone given a last name since the list was drawn', async () => {
		const f = fakeDeps([contact('lea', 'Brunner')]);

		expect(await settleWithoutLastName(f.deps, viewer, 'lea')).toBe(true);

		expect(f.marks).toEqual([]);
	});
});

describe('askAgainForLastName', () => {
	it('takes the mark back, so the person is asked about again', async () => {
		const f = fakeDeps([contact('jonas', null)]);

		expect(await askAgainForLastName(f.deps, viewer, 'jonas')).toBe(true);

		expect(f.marks).toEqual([{ id: 'jonas', at: null }]);
	});

	it('writes nothing for a person the viewer may not see', async () => {
		const f = fakeDeps([]);

		expect(await askAgainForLastName(f.deps, viewer, 'jonas')).toBe(false);

		expect(f.marks).toEqual([]);
	});
});
