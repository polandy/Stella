import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import {
	inMemoryRelationshipTies,
	relationshipRepositoryWith,
	relationshipTypeRepositoryWith,
	someTie
} from '../testing';
import { BUILT_IN_RELATIONSHIP_TYPES } from './built-in-types';
import type { NewRelationship } from './relationships';
import { stageRelationships } from './staged-relationships';

/*
 * The staging a batch of links is checked through (docs/02 §2.4, ADR-118): nothing reaches the
 * store, and every read sees the links staged so far as though they were on record. The batch's
 * guardrails are `add-many.test.ts`'s; these pin the staging itself.
 */

const viewer: Viewer = { id: 'u1', householdId: 'h1' };
const typeById = new Map(BUILT_IN_RELATIONSHIP_TYPES.map((type) => [type.id, type]));

const link = (from: string, typeId: string, to: string): NewRelationship => ({
	id: `${from}-${typeId}-${to}`,
	householdId: 'h1',
	fromContactId: from,
	toContactId: to,
	typeId,
	createdBy: 'u1',
	createdAt: 1,
	updatedAt: 1,
	description: null,
	sinceDate: null,
	status: 'current'
});

/** A household of Lio and Anna, Anna on record as Lio's parent; every read is counted. */
function household() {
	const reads = { graph: 0, ties: 0, types: 0 };
	const onRecord = [link('anna', 'parent_child', 'lio')];
	const ties = inMemoryRelationshipTies({ lio: [someTie('rec-1', 'anna')] });
	const staging = stageRelationships(
		{
			relationships: relationshipRepositoryWith({
				async exists(from, to, typeId) {
					return onRecord.some(
						(r) => r.fromContactId === from && r.toContactId === to && r.typeId === typeId
					);
				}
			}),
			kinship: {
				async loadKinshipGraphVisibleTo() {
					reads.graph++;
					return {
						people: [
							{ id: 'lio', displayName: 'Lio' },
							{ id: 'anna', displayName: 'Anna' },
							{ id: 'bert', displayName: 'Bert' }
						],
						parentEdges: [{ parentId: 'anna', childId: 'lio' }],
						siblingEdges: [],
						partnerEdges: [],
						storedPairs: [{ a: 'anna', b: 'lio' }]
					};
				}
			},
			ties: {
				async listForContactVisibleTo(v, contactId) {
					reads.ties++;
					return ties.listForContactVisibleTo(v, contactId);
				}
			}
		},
		relationshipTypeRepositoryWith({
			async getType(_viewer, typeId) {
				reads.types++;
				return typeById.get(typeId) ?? null;
			}
		})
	);
	return { ...staging, reads };
}

describe('stageRelationships', () => {
	it('stages an insert instead of writing it, and hands back what passed in order', async () => {
		const { deps, staged } = household();
		await deps.relationships.insert(link('bert', 'parent_child', 'lio'));
		await deps.relationships.insert(link('anna', 'partner', 'bert'));

		expect(staged().map((r) => r.id)).toEqual(['bert-parent_child-lio', 'anna-partner-bert']);
	});

	it('hands back a copy, so the batch cannot change what was staged', async () => {
		const { deps, staged } = household();
		await deps.relationships.insert(link('bert', 'parent_child', 'lio'));
		(staged() as NewRelationship[]).length = 0;

		expect(staged()).toHaveLength(1);
	});

	it('finds a link of the same direction and type whether staged or on record', async () => {
		const { deps } = household();
		await deps.relationships.insert(link('bert', 'parent_child', 'lio'));

		expect(await deps.relationships.exists('bert', 'lio', 'parent_child')).toBe(true);
		expect(await deps.relationships.exists('anna', 'lio', 'parent_child')).toBe(true);
		expect(await deps.relationships.exists('lio', 'bert', 'parent_child')).toBe(false);
		expect(await deps.relationships.exists('bert', 'lio', 'friend')).toBe(false);
	});

	it('reads the household’s graph once, with the staged links added as edges of their kind', async () => {
		const { deps, reads } = household();
		await deps.relationships.insert(link('bert', 'parent_child', 'lio'));
		await deps.relationships.insert(link('anna', 'partner', 'bert'));

		await deps.kinship.loadKinshipGraphVisibleTo(viewer);
		const graph = await deps.kinship.loadKinshipGraphVisibleTo(viewer);

		expect(reads.graph).toBe(1);
		expect(graph.parentEdges).toEqual([
			{ parentId: 'anna', childId: 'lio' },
			{ parentId: 'bert', childId: 'lio' }
		]);
		expect(graph.partnerEdges).toEqual([{ a: 'anna', b: 'bert', former: false, sinceDate: null }]);
		expect(graph.storedPairs).toHaveLength(3);
	});

	it('adds a person’s staged links to their ties, from their side and named as the household sees them', async () => {
		const { deps } = household();
		await deps.relationships.insert(link('bert', 'parent_child', 'lio'));
		await deps.relationships.insert(link('anna', 'partner', 'bert'));

		const ties = await deps.ties.listForContactVisibleTo(viewer, 'lio');

		expect(ties.map((t) => t.id)).toEqual(['rec-1', 'bert-parent_child-lio']);
		expect(ties[1]).toEqual({
			id: 'bert-parent_child-lio',
			otherContactId: 'bert',
			otherDisplayName: 'Bert',
			label: 'Child of',
			typeId: 'parent_child',
			typeKey: 'parent_child',
			side: 'reverse',
			category: 'family',
			description: null,
			sinceDate: null,
			status: 'current'
		});
	});

	it('reads each person’s ties and each type from the store once', async () => {
		const { deps, reads } = household();
		await deps.relationships.insert(link('bert', 'parent_child', 'lio'));

		await deps.ties.listForContactVisibleTo(viewer, 'lio');
		await deps.ties.listForContactVisibleTo(viewer, 'lio');
		await deps.kinship.loadKinshipGraphVisibleTo(viewer);

		expect(reads.ties).toBe(1);
		expect(reads.types).toBe(1);
	});

	it('names someone out of the viewer’s sight with nothing at all', async () => {
		const { nameOf } = household();
		expect(await nameOf(viewer, 'anna')).toBe('Anna');
		expect(await nameOf(viewer, 'hidden')).toBe('');
	});

	it('fails loud on a staged link whose type the store does not know', async () => {
		const { deps } = household();
		await deps.relationships.insert(link('bert', 'no-such-type', 'lio'));

		await expect(deps.kinship.loadKinshipGraphVisibleTo(viewer)).rejects.toThrow(
			'A staged link carries an unknown type: no-such-type'
		);
	});
});
