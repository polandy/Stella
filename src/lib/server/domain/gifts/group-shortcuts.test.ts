import { describe, expect, it } from 'bun:test';
import { inMemoryKinshipGraph } from '../testing/relationships';
import { readGroupShortcuts, type GroupShortcutDeps } from './group-shortcuts';

/*
 * The sets one tap ticks on the form for several people (docs/dev/02 §2.25.11), read about the
 * person the form was opened from, over in-memory ports that already keep what the viewer sees.
 */

const VIEWER = { id: 'andy', householdId: 'h1' };
const person = (id: string) => ({ id, displayName: id.toUpperCase() });

const deps: GroupShortcutDeps = {
	kinship: inMemoryKinshipGraph({
		people: ['anna', 'mia', 'ben'].map(person),
		parentEdges: [
			{ parentId: 'anna', childId: 'mia' },
			{ parentId: 'anna', childId: 'ben' }
		]
	}),
	homeReads: {
		async listForContactVisibleTo(_viewer, contactId) {
			return contactId === 'mia'
				? [
						{
							id: 'h',
							label: null,
							value: 'Lindenweg 3',
							livesWith: [{ id: 'anna', displayName: 'Anna' }]
						},
						{ id: 'g', label: 'Grandma', value: 'Hof 1', livesWith: [] }
					]
				: [];
		}
	},
	memberships: {
		async listForContactVisibleTo(_viewer, contactId) {
			return contactId === 'mia'
				? [
						{
							membershipId: 'm',
							circleId: 'kita',
							name: 'Kita',
							kind: 'school',
							color: 'blue',
							role: null
						}
					]
				: [];
		},
		async listMembersVisibleTo(_viewer, circleId) {
			return ['mia', 'noah'].map((contactId) => ({
				membershipId: `${circleId}-${contactId}`,
				contactId,
				displayName: contactId,
				avatarPhotoId: null,
				role: null
			}));
		}
	}
};

describe('readGroupShortcuts', () => {
	it('reads the family, homes and circles of the person the form is for', async () => {
		expect(await readGroupShortcuts(deps, VIEWER, 'mia')).toEqual([
			{ kind: 'children', name: 'ANNA', ids: ['mia', 'ben'] },
			{ kind: 'siblings', name: 'MIA', ids: ['ben'] },
			{ kind: 'home', name: 'Lindenweg 3', ids: ['mia', 'anna'] },
			{ kind: 'circle', name: 'Kita', ids: ['mia', 'noah'] }
		]);
	});

	it('offers nothing about someone the viewer may not see', async () => {
		expect(await readGroupShortcuts(deps, VIEWER, 'stranger')).toEqual([]);
	});
});
