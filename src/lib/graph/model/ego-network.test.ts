import { describe, expect, it } from 'bun:test';
import {
	buildEgoNetwork,
	circleRoles,
	expandNode,
	rebuildExplored,
	rolesOpenAfter
} from './ego-network';
import { emptyModel } from './graph-model';
import { fakeGraphSource, familyEdges, familyNodes, familySource } from './fixtures';
import type { GraphModel } from './types';

/*
 * buildEgoNetwork / expandNode (docs/04 §4.11). Lazy, hop-by-hop growth over the
 * GraphDataSource port, tested against an in-memory fake — no DB, fully deterministic.
 */

const ids = (m: GraphModel) => new Set(m.nodes.map((n) => n.id));
const edgeIds = (m: GraphModel) => new Set(m.edges.map((e) => e.id));

describe('buildEgoNetwork', () => {
	it('at depth 1 returns the centre, its direct neighbours, and the incident edges only', async () => {
		const model = await buildEgoNetwork(familySource(), 'mara', 1);

		// direct neighbours of Mara: partner, child, father, brother, friend, colleague,
		// the circle (membership), and grandfather (via the derived kinship edge).
		expect(ids(model)).toEqual(
			new Set(['mara', 'jonas', 'lio', 'peter', 'simon', 'sarah', 'tobias', 'kegel', 'walter'])
		);
		// second-hop-only nodes are absent
		expect(ids(model).has('doris')).toBe(false); // only reachable via the circle
		expect(ids(model).has('elena')).toBe(false); // only reachable via Tobias

		// only edges incident to Mara — Peter↔Walter (r4) is one hop further out
		expect(edgeIds(model)).toEqual(new Set(['r1', 'r2', 'r3', 'r5', 'r6', 'r7', 'k1', 'm1']));
		expect(edgeIds(model).has('r4')).toBe(false);
	});

	it('at depth 2 pulls in second-hop nodes and their connecting edges', async () => {
		const model = await buildEgoNetwork(familySource(), 'mara', 2);

		expect(ids(model).has('doris')).toBe(true);
		expect(ids(model).has('elena')).toBe(true);
		expect(edgeIds(model).has('r4')).toBe(true); // Peter → Walter
		expect(edgeIds(model).has('r8')).toBe(true); // Tobias → Elena
		expect(edgeIds(model).has('m4')).toBe(true); // Kegelclub → Doris
	});

	it('deduplicates nodes and edges reached through several paths', async () => {
		const model = await buildEgoNetwork(familySource(), 'mara', 2);
		expect(model.nodes.filter((n) => n.id === 'walter')).toHaveLength(1);
		expect(model.edges.filter((e) => e.id === 'k1')).toHaveLength(1);
	});

	it('returns an empty model for an unknown centre', async () => {
		const model = await buildEgoNetwork(familySource(), 'nobody', 2);
		expect(model.nodes).toHaveLength(0);
		expect(model.edges).toHaveLength(0);
	});

	it('at depth 0 returns just the centre node', async () => {
		const model = await buildEgoNetwork(familySource(), 'mara', 0);
		expect(ids(model)).toEqual(new Set(['mara']));
		expect(model.edges).toHaveLength(0);
	});
});

describe('expandNode', () => {
	it('merges a node’s neighbourhood into the existing model', async () => {
		const source = familySource();
		const ego = await buildEgoNetwork(source, 'mara', 1);
		expect(ids(ego).has('elena')).toBe(false);

		const expanded = await expandNode(source, ego, 'tobias');
		expect(ids(expanded).has('elena')).toBe(true);
		expect(edgeIds(expanded).has('r8')).toBe(true);
	});

	it('leaves the model unchanged for an unknown node', async () => {
		const source = familySource();
		const ego = await buildEgoNetwork(source, 'mara', 1);
		const after = await expandNode(source, ego, 'nobody');
		expect(ids(after)).toEqual(ids(ego));
		expect(edgeIds(after)).toEqual(edgeIds(ego));
	});

	it('does not mutate the input model', async () => {
		const source = familySource();
		const ego = await buildEgoNetwork(source, 'mara', 1);
		const before = ego.nodes.length;
		await expandNode(source, ego, 'tobias');
		expect(ego.nodes).toHaveLength(before);
	});

	it('can grow from an empty model', async () => {
		const expanded = await expandNode(familySource(), emptyModel(), 'mara');
		expect(ids(expanded).has('mara')).toBe(true);
		expect(ids(expanded).has('jonas')).toBe(true);
	});
});

describe('rebuildExplored', () => {
	it('rebuilds the ego view around the centre when nothing was expanded', async () => {
		const model = await rebuildExplored(familySource(), 'mara', []);

		expect(ids(model)).toEqual(ids(await buildEgoNetwork(familySource(), 'mara', 1)));
	});

	it('re-applies an expansion the reader had made', async () => {
		const model = await rebuildExplored(familySource(), 'mara', ['tobias']);

		expect(ids(model).has('elena')).toBe(true); // only reachable through Tobias
		expect(edgeIds(model).has('r8')).toBe(true);
	});

	it('re-applies expansions in order, including one only a previous expansion revealed', async () => {
		const model = await rebuildExplored(familySource(), 'sarah', ['kegel', 'doris']);

		// Doris is two hops out: she arrives with the circle, and expanding her is only
		// possible once it has been.
		expect(ids(model).has('doris')).toBe(true);
	});

	it('skips an expanded node the fresh snapshot no longer reaches from the centre', async () => {
		// Mara's link to Tobias is gone, so Elena — revealed only by expanding him — must not
		// come back as an island.
		const source = fakeGraphSource(
			familyNodes,
			familyEdges.filter((e) => e.id !== 'r7')
		);
		const model = await rebuildExplored(source, 'mara', ['tobias']);

		expect(ids(model).has('tobias')).toBe(false);
		expect(ids(model).has('elena')).toBe(false);
	});

	it('yields an empty model when the centre itself is gone', async () => {
		const model = await rebuildExplored(familySource(), 'nobody', ['mara']);

		expect(model.nodes).toHaveLength(0);
		expect(model.edges).toHaveLength(0);
	});
});

describe('circle roles', () => {
	const roled = familyEdges.map((e) =>
		e.id === 'm2'
			? { ...e, label: 'Trainer' }
			: e.id === 'm3'
				? { ...e, label: 'Trainer' }
				: e.id === 'm4'
					? { ...e, label: 'Kassier' }
					: e
	);
	const source = () => fakeGraphSource(familyNodes, roled);

	it('lists the roles most-populated first, "no role" last', async () => {
		const hood = await source().neighborhood('kegel');
		expect(circleRoles(hood!)).toEqual([
			{ role: 'Trainer', count: 2 },
			{ role: 'Kassier', count: 1 },
			{ role: null, count: 1 }
		]);
	});

	it('expands a circle only for the chosen roles', async () => {
		const model = await expandNode(
			source(),
			{ nodes: [], edges: [] },
			'kegel',
			new Set(['Kassier'])
		);
		expect(ids(model)).toEqual(new Set(['kegel', 'doris']));
		expect(edgeIds(model)).toEqual(new Set(['m4']));
	});

	it('reveals members without a role when null is chosen', async () => {
		const model = await expandNode(source(), { nodes: [], edges: [] }, 'kegel', new Set([null]));
		expect(ids(model)).toEqual(new Set(['kegel', 'mara']));
	});

	it('expands every member when no roles are given', async () => {
		const model = await expandNode(source(), { nodes: [], edges: [] }, 'kegel');
		expect(ids(model)).toEqual(new Set(['kegel', 'mara', 'sarah', 'jonas', 'doris']));
	});

	it('rebuilds an expanded circle for the roles it was opened with', async () => {
		const model = await rebuildExplored(
			source(),
			'jonas',
			['kegel'],
			1,
			new Map([['kegel', new Set<string | null>(['Kassier'])]])
		);
		expect(ids(model).has('doris')).toBe(true);
		expect(ids(model).has('sarah')).toBe(false); // a Trainer, so not opened up
	});
});

describe('rolesOpenAfter', () => {
	const all = new Set<string | null>(['Trainer', 'Kassier', null]);

	it('remembers the chosen roles on a first expansion', () => {
		expect(rolesOpenAfter(false, undefined, new Set(['Kassier']), all)).toEqual(
			new Set(['Kassier'])
		);
	});

	it('widens what was already open instead of replacing it', () => {
		expect(rolesOpenAfter(true, new Set(['Kassier']), new Set(['Trainer']), all)).toEqual(
			new Set(['Kassier', 'Trainer'])
		);
	});

	it('is fully open once every role has been opened', () => {
		expect(rolesOpenAfter(true, new Set(['Kassier']), new Set(['Trainer', null]), all)).toBe(
			undefined
		);
	});

	it('stays fully open when a circle already opened whole is expanded for some roles', () => {
		expect(rolesOpenAfter(true, undefined, new Set(['Kassier']), all)).toBe(undefined);
	});

	it('treats a circle whose roles are unknown as fully open', () => {
		expect(rolesOpenAfter(false, undefined, new Set(), new Set())).toBe(undefined);
	});
});
