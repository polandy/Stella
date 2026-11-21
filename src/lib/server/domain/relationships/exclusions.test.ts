import { describe, expect, it } from 'bun:test';
import { createTranslator } from '../../../i18n/translate';
import type { KinshipGraph } from '../../../kinship/kinship';
import type { Viewer } from '../../access/visibility';
import { guardExclusions, RelationshipExcludedError, type ExclusionSource } from './exclusions';
import type { RelationshipType } from './relationships';

/*
 * The guard a new link passes before it is written (docs/dev/02 §2.4): the household's own
 * records, read for the viewer, refuse a tie that cannot hold beside them, and a read that
 * fails is never taken for "nothing stands in the way".
 */

const t = createTranslator('en');
const viewer: Viewer = { id: 'u1', householdId: 'h1' };

const parentChild: RelationshipType = {
	id: 'rt-parent',
	householdId: null,
	key: 'parent_child',
	forwardLabel: 'Parent of',
	reverseLabel: 'Child of',
	category: 'family',
	symmetric: false,
	sortOrder: 0
};

const graph: KinshipGraph = {
	people: [
		{ id: 'lio', displayName: 'Lio' },
		{ id: 'anna', displayName: 'Anna' },
		{ id: 'bert', displayName: 'Bert' },
		{ id: 'carla', displayName: 'Carla' }
	],
	parentEdges: [
		{ parentId: 'anna', childId: 'lio' },
		{ parentId: 'bert', childId: 'lio' }
	],
	siblingEdges: [],
	partnerEdges: [],
	storedPairs: []
};

function source(load: () => Promise<KinshipGraph> = async () => graph): ExclusionSource {
	return {
		kinship: { loadKinshipGraphVisibleTo: load },
		ties: { listForContactVisibleTo: async () => [] }
	};
}

const carlaParentOfLio = { fromContactId: 'carla', toContactId: 'lio' };

describe('guardExclusions', () => {
	it('refuses a third parent, naming the child whose parents are on record', async () => {
		const refused = await guardExclusions(source(), viewer, carlaParentOfLio, parentChild, 'carla')
			.then(() => null)
			.catch((err: unknown) => err);

		expect(refused).toBeInstanceOf(RelationshipExcludedError);
		expect((refused as RelationshipExcludedError).reason).toBe('parentsComplete');
		expect((refused as RelationshipExcludedError).phrase(t)).toContain('Lio');
	});

	it('lets a failed read through as the failure it is, not as a refusal or a pass', async () => {
		const down = new Error('database is locked');
		const thrown = await guardExclusions(
			source(async () => {
				throw down;
			}),
			viewer,
			carlaParentOfLio,
			parentChild,
			'carla'
		)
			.then(() => null)
			.catch((err: unknown) => err);

		expect(thrown).toBe(down);
	});

	it('lets a former partner be added to someone who has a current one', async () => {
		const partner: RelationshipType = {
			id: 'rt-partner',
			householdId: null,
			key: 'partner',
			forwardLabel: 'Partner of',
			reverseLabel: 'Partner of',
			category: 'romantic',
			symmetric: true,
			sortOrder: 3
		};
		const withCurrentPartner: KinshipGraph = {
			...graph,
			partnerEdges: [{ a: 'anna', b: 'bert' }]
		};
		const claim = (former: boolean) =>
			guardExclusions(
				source(async () => withCurrentPartner),
				viewer,
				{ fromContactId: 'anna', toContactId: 'carla' },
				partner,
				'anna',
				{ former }
			)
				.then(() => null)
				.catch((err: unknown) => err);

		expect(await claim(true)).toBeNull();
		expect(await claim(false)).toBeInstanceOf(RelationshipExcludedError);
	});
});
