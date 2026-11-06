import { describe, expect, it } from 'bun:test';
import type { Remover } from '../../access/visibility';
import { fixedClock, sequentialIds } from '../testing';
import { removalAudit, type RemovableRecord } from './removal';

/*
 * The household is told when someone removes another member's record (docs/03 §3.7): the kind,
 * the place and both members, never the text. An author tidying up their own record tells nobody.
 */

const deps = () => ({ ids: sequentialIds('act-1'), clock: fixedClock(5000) });
const remover: Remover = { id: 'u-admin', householdId: 'h1', isAdmin: true };

const note = (over: Partial<RemovableRecord> = {}): RemovableRecord => ({
	id: 'note-1',
	contactId: 'c-anna',
	person: 'Anna',
	personVisibility: 'shared',
	authorId: 'u-bert',
	authorName: 'Bert',
	...over
});

describe('removalAudit', () => {
	it('writes nothing when the author removes their own record', () => {
		expect(removalAudit(deps(), remover, 'note', note({ authorId: 'u-admin' }))).toBeNull();
	});

	it('names the kind, the person and the author of someone else’s record, as the remover', () => {
		expect(removalAudit(deps(), remover, 'journal_entry', note())).toEqual({
			id: 'act-1',
			householdId: 'h1',
			actorId: 'u-admin',
			createdAt: 5000,
			event: {
				kind: 'record.removed',
				recordKind: 'journal_entry',
				recordId: 'note-1',
				contactId: 'c-anna',
				person: 'Anna',
				authorId: 'u-bert',
				authorName: 'Bert',
				visibility: 'shared'
			}
		});
	});

	it('is no more visible than the person the record was on', () => {
		const entry = removalAudit(deps(), remover, 'note', note({ personVisibility: 'private' }));
		expect(entry?.event.visibility).toBe('private');
	});
});
