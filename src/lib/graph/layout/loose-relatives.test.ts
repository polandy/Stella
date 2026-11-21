import { describe, expect, it } from 'bun:test';
import { familyTreeLayout, TREE_SPACING } from './family-tree';
import { siaCousins } from './family-fixtures';
import type { GraphEdge, GraphModel } from '../model/types';

/*
 * Relatives the tree has no bar for (docs/dev/05 §5.8): a cousin entered straight onto Sia, with
 * no aunt or uncle on record, stands with the others like it at the end of the row, on the side
 * of the parent the link runs through, and no line runs over the row to them.
 */

const cousins = ['lacky', 'checky', 'hoat', 'mouy'];
const anchored = ['sebi', 'steve', 'linda', 'andy', 'sia'];
const cousinLines = cousins.map((c) => `${c}-cousin-sia`);

const sizeOf = () => ({ width: 80, height: 64 });

describe('loose relatives in the family tree', () => {
	it('sends cousins with no aunt or uncle on record to the end of their row, a family apart', () => {
		const { positions } = familyTreeLayout(siaCousins, sizeOf);
		const x = (id: string) => positions.get(id)!.x;
		const lastAnchored = Math.max(...anchored.map(x));
		const firstLoose = Math.min(...cousins.map(x));

		for (const c of cousins) expect(positions.get(c)!.y).toBe(positions.get('sia')!.y);
		expect(firstLoose - lastAnchored).toBeGreaterThanOrEqual(80 + TREE_SPACING.family);
	});

	it('leaves the rest of the tree as it stands without them', () => {
		const without: GraphModel = {
			nodes: siaCousins.nodes.filter((n) => !cousins.includes(n.id)),
			edges: siaCousins.edges.filter((e) => !cousinLines.includes(e.id))
		};
		const withThem = familyTreeLayout(siaCousins, sizeOf).positions;
		const alone = familyTreeLayout(without, sizeOf).positions;
		const shift = withThem.get('sia')!.x - alone.get('sia')!.x;

		for (const n of without.nodes) {
			expect(withThem.get(n.id)!.x - shift).toBe(alone.get(n.id)!.x);
		}
	});

	it('draws no line over the row to them: their lines are dotted and take no lane', () => {
		const { routes, dottedLines } = familyTreeLayout(siaCousins, sizeOf);

		for (const id of cousinLines) {
			expect(routes!.has(id)).toBe(false);
			expect(dottedLines!.has(id)).toBe(true);
		}
		expect(dottedLines!.has('andy-spouse-sia')).toBe(false);
	});

	it('stands them on the side of the parent the link runs through', () => {
		// Mouy is Andy's cousin through his father, whose family stands on the left.
		const viaFrancesco: GraphEdge = {
			id: 'kin:mouy:andy',
			source: 'mouy',
			target: 'andy',
			kind: 'kinship',
			kin: { term: 'cousin', variant: 'neutral', via: ['francesco', 'gone'] },
			derived: true
		};
		const model: GraphModel = {
			nodes: siaCousins.nodes,
			edges: [...siaCousins.edges.filter((e) => e.id !== 'mouy-cousin-sia'), viaFrancesco]
		};
		const { positions } = familyTreeLayout(model, sizeOf);
		const x = (id: string) => positions.get(id)!.x;

		expect(x('francesco')).toBeLessThan(x('kekly'));
		expect(x('mouy')).toBeLessThan(Math.min(...anchored.map(x)));
		expect(x('lacky')).toBeGreaterThan(Math.max(...anchored.map(x)));
	});
});
