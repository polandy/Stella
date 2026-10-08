import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import type { Contact, ContactSummary } from '../contacts/contacts';
import { InvalidInteractionError, type NewInteraction } from './interactions';
import { ContactGoneError } from '../contacts/require-visible';
import { logInteractionChecked, type LogCheckedDeps } from './log-checked';

/*
 * Logging a call or visit (docs/02 §2.6) as one use-case, so the person page and one kept on a
 * phone (docs/02 §2.18.1) are checked the same way: the person must be
 * visible, and so must everyone named as taking part — an unknown participant is refused rather
 * than stored, so nothing outside the author's view is ever attached.
 */

const author = { userId: 'u1', householdId: 'h1' };
const summary = (id: string, visibility: 'shared' | 'private' = 'shared'): ContactSummary => ({
	id,
	displayName: id,
	firstName: null,
	lastName: null,
	nickname: null,
	formerName: null,
	jobTitle: null,
	company: null,
	description: null,
	metPlace: null,
	metDate: null,
	visibility,
	avatarPhotoId: null,
	birthDate: null
});

function fakes(visibleIds = ['oma', 'lena', 'noah']) {
	const logged: NewInteraction[] = [];
	const asked: string[][] = [];
	const deps: LogCheckedDeps = {
		contacts: {
			async findByIdVisibleTo(_v: Viewer, id: string) {
				return visibleIds.includes(id) ? (summary(id) as unknown as Contact) : null;
			}
		},
		contactNames: {
			async listBrowsableNamesAmong(_v: Viewer, ids: readonly string[]) {
				asked.push([...ids]);
				return visibleIds.filter((id) => ids.includes(id)).map((id) => ({ id, displayName: id }));
			}
		},
		interactions: {
			insert: async (i: NewInteraction) => void logged.push(i)
		} as unknown as LogCheckedDeps['interactions'],
		ids: { next: () => 'i1' },
		clock: { now: () => 7 }
	};
	return { deps, logged, asked };
}

const call = {
	contactId: 'oma',
	kind: 'call' as const,
	happenedAt: '2026-09-27',
	title: 'Sunday call',
	description: null,
	visibility: 'shared' as const,
	participantIds: ['lena']
};

describe('logInteractionChecked', () => {
	it('logs a call with the people who took part', async () => {
		const f = fakes();
		expect(await logInteractionChecked(f.deps, author, call)).toEqual({ interactionId: 'i1' });
		expect(f.logged[0]).toMatchObject({
			contactId: 'oma',
			kind: 'call',
			createdBy: 'u1',
			participantIds: ['lena']
		});
		// Only the people named as taking part are looked up, never the whole household.
		expect(f.asked).toEqual([['lena']]);
	});

	it('looks nobody up for a touchpoint with no one else in it', async () => {
		const f = fakes();
		await logInteractionChecked(f.deps, author, { ...call, participantIds: [] });
		expect(f.asked).toEqual([]);
		expect(f.logged).toHaveLength(1);
	});

	it('refuses a person the author cannot see, and a participant they cannot see, storing nothing', async () => {
		const gone = fakes(['lena']);
		await expect(logInteractionChecked(gone.deps, author, call)).rejects.toBeInstanceOf(
			ContactGoneError
		);
		const hidden = fakes(['oma']);
		await expect(logInteractionChecked(hidden.deps, author, call)).rejects.toBeInstanceOf(
			InvalidInteractionError
		);
		expect([...gone.logged, ...hidden.logged]).toHaveLength(0);
	});
});
