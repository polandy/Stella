import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import { suggestNameCandidates, type NameCandidateSource } from './suggestions';

/*
 * The use-case behind quick-add's suggestions (docs/02 §2.2.1): asks the candidate source
 * for what the viewer may see and ranks it. Tested with a fake source that records the
 * viewer it was asked for, so scoping is asserted rather than assumed.
 */

const viewer: Viewer = { id: 'u1', householdId: 'h1' };

function source() {
	const asked: Viewer[] = [];
	const s: NameCandidateSource & { asked: Viewer[] } = {
		asked,
		async listNameCandidatesVisibleTo(v) {
			asked.push(v);
			return [
				{ id: 'a', displayName: 'Anna Roth', firstName: 'Anna', lastName: 'Roth', relationshipCount: 0 },
				{ id: 'b', displayName: 'Beat Vogel', firstName: 'Beat', lastName: 'Vogel', relationshipCount: 0 }
			];
		}
	};
	return s;
}

describe('suggestNameCandidates', () => {
	it('ranks what the source returns for this viewer', async () => {
		const s = source();
		const found = await suggestNameCandidates({ candidates: s }, viewer, { lastName: 'roth' });
		expect(found).toEqual([{ id: 'a', displayName: 'Anna Roth', reason: 'same-surname' }]);
		expect(s.asked).toEqual([viewer]);
	});

	it('does not even ask the source without a surname', async () => {
		const s = source();
		expect(await suggestNameCandidates({ candidates: s }, viewer, { firstName: 'Anna' })).toEqual([]);
		expect(s.asked).toEqual([]);
	});
});
