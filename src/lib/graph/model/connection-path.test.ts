import { describe, expect, it } from 'bun:test';
import { findConnectionPath } from './connection-path';
import { familySource } from './fixtures';

/*
 * findConnectionPath (docs/02 §2.7): the shortest chain that links two people through
 * relationships and circle co-membership, e.g. "You → Peter → Ski Course → Hans". BFS over
 * the GraphDataSource port; returns exactly the nodes and edges of that chain.
 */

describe('findConnectionPath', () => {
	it('finds a multi-hop path through an intermediate person', async () => {
		const path = await findConnectionPath(familySource(), 'mara', 'elena');
		expect(path).not.toBeNull();
		expect(path?.nodeIds).toEqual(['mara', 'tobias', 'elena']);
		expect(path?.model.edges.map((e) => e.id)).toEqual(['r7', 'r8']);
	});

	it('routes through a circle when that is the only connection', async () => {
		const path = await findConnectionPath(familySource(), 'mara', 'doris');
		expect(path?.nodeIds).toEqual(['mara', 'kegel', 'doris']);
		expect(path?.model.edges.map((e) => e.id)).toEqual(['m1', 'm4']);
	});

	it('prefers the shortest chain when several exist', async () => {
		// Mara reaches Walter directly via the derived kinship edge (k1) and indirectly via
		// Peter (r3 + r4). BFS must take the single-hop kinship edge.
		const path = await findConnectionPath(familySource(), 'mara', 'walter');
		expect(path?.nodeIds).toEqual(['mara', 'walter']);
		expect(path?.model.edges.map((e) => e.id)).toEqual(['k1']);
	});

	it('returns just the node for identical endpoints', async () => {
		const path = await findConnectionPath(familySource(), 'mara', 'mara');
		expect(path?.nodeIds).toEqual(['mara']);
		expect(path?.model.edges).toHaveLength(0);
	});

	it('returns null when no path exists', async () => {
		const path = await findConnectionPath(familySource(), 'mara', 'ghost');
		expect(path).toBeNull();
	});

	it('returns null for an unknown endpoint', async () => {
		expect(await findConnectionPath(familySource(), 'mara', 'nobody')).toBeNull();
		expect(await findConnectionPath(familySource(), 'nobody', 'mara')).toBeNull();
	});

	it('respects the maximum search depth', async () => {
		// mara → tobias → elena needs 2 hops; capping at 1 must find nothing.
		expect(await findConnectionPath(familySource(), 'mara', 'elena', 1)).toBeNull();
	});

	it('carries the connecting nodes into the returned sub-model', async () => {
		const path = await findConnectionPath(familySource(), 'mara', 'doris');
		expect(new Set(path?.model.nodes.map((n) => n.id))).toEqual(new Set(['mara', 'kegel', 'doris']));
	});
});
