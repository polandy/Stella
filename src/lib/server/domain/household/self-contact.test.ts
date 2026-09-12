import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import {
	setSelfContact,
	UnknownSelfContactError,
	type SelfContactDeps
} from './self-contact';

/*
 * Choosing which person you are (docs/02 §2.1.3). The rules that matter: only a contact the
 * member may actually see can be stored, and the link can always be taken back.
 */

const andy: Viewer = { id: 'u1', householdId: 'h1' };

/** A store that records every write, so "nothing was stored" can be asserted positively. */
function depsWith(visible: string[]): SelfContactDeps & { writes: [string, string | null][] } {
	const writes: [string, string | null][] = [];
	return {
		writes,
		contacts: {
			async findByIdVisibleTo(viewer, id) {
				return viewer.id === andy.id && visible.includes(id) ? { id } : null;
			}
		},
		accounts: {
			async updateSelfContact(userId, contactId) {
				writes.push([userId, contactId]);
			}
		}
	};
}

describe('setSelfContact', () => {
	it('stores the contact the member says they are', async () => {
		const deps = depsWith(['c1']);

		const stored = await setSelfContact(deps, andy, 'c1');

		expect(stored).toBe('c1');
		expect(deps.writes).toEqual([['u1', 'c1']]);
	});

	it('clears the link when nothing is chosen', async () => {
		const deps = depsWith(['c1']);

		expect(await setSelfContact(deps, andy, null)).toBeNull();
		expect(await setSelfContact(deps, andy, '  ')).toBeNull();
		expect(deps.writes).toEqual([
			['u1', null],
			['u1', null]
		]);
	});

	it('refuses a contact the member cannot see, and stores nothing', async () => {
		const deps = depsWith(['c1']);

		// positive control: the visible one goes through and is recorded
		await setSelfContact(deps, andy, 'c1');
		expect(deps.writes).toHaveLength(1);

		await expect(setSelfContact(deps, andy, 'c-private')).rejects.toBeInstanceOf(
			UnknownSelfContactError
		);
		expect(deps.writes).toHaveLength(1);
	});
});
