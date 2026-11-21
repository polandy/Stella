import { describe, expect, it } from 'bun:test';
import { familyTreeLayout } from './family-tree';
import { defaultSizeOf } from './geometry';
import { barSpans, crossingBars } from './tree-lines';
import { brunnerKeller, twoFamilies } from './family-fixtures';
import { inRememberedOrder, orderBreaks, ordersAfterDrop } from './tree-order';
import type { GraphModel } from '../model/types';

/*
 * Dragging in the family tree (docs/dev/05 §5.8): a drop snaps the person's unit into their
 * row, the row's order is remembered, and the tree is laid out again around it.
 */

const xOf = (arrangement: ReturnType<typeof familyTreeLayout>, id: string) =>
	arrangement.positions.get(id)!.x;

const crossings = (model: GraphModel, arrangement: ReturnType<typeof familyTreeLayout>) =>
	crossingBars(
		barSpans(
			model.edges,
			arrangement.positions,
			new Set(arrangement.rows.flat().flat()),
			defaultSizeOf
		)
	);

describe('ordersAfterDrop', () => {
	const tree = familyTreeLayout(brunnerKeller);
	const drop = (id: string, x: number) => ordersAfterDrop(tree.rows, tree.positions, id, x, []);

	it('the grandparents start with the father’s side left', () => {
		expect(xOf(tree, 'hans')).toBeLessThan(xOf(tree, 'peter'));
	});

	it('puts the dragged person’s couple at the place nearest the drop, the partner along', () => {
		const orders = drop('peter', xOf(tree, 'hans') - 500);
		expect(orders).toEqual([['peter', 'ursula', 'hans', 'rosa']]);
	});

	it('leaves the row as it was for a drop that lands in the same place', () => {
		const orders = drop('peter', xOf(tree, 'peter') + 10);
		expect(orders).toEqual([['hans', 'rosa', 'peter', 'ursula']]);
	});

	it('moves a single among their siblings', () => {
		const row = tree.rows.find((r) => r.flat().includes('lena'))!.flat();
		const rightmost = Math.max(...row.map((id) => xOf(tree, id)));
		const orders = drop(row[0], rightmost + 200)!;
		expect(orders[0].at(-1)).toBe(row[0]);
		expect(new Set(orders[0])).toEqual(new Set(row));
	});

	it('replaces what was remembered for that row and keeps the other rows’', () => {
		const before = [
			['hans', 'rosa', 'peter', 'ursula'],
			['lena', 'noah', 'elias']
		];
		const orders = ordersAfterDrop(
			tree.rows,
			tree.positions,
			'peter',
			xOf(tree, 'hans') - 500,
			before
		);
		expect(orders).toEqual([
			['lena', 'noah', 'elias'],
			['peter', 'ursula', 'hans', 'rosa']
		]);
	});

	it('orders nothing for somebody on no family row', () => {
		expect(drop('nobody', 0)).toBeNull();
	});
});

describe('the tree with a remembered order', () => {
	it('keeps the dragged row and lays the rows beneath out to suit it, no bar crossed', () => {
		const orders = [['peter', 'ursula', 'hans', 'rosa']];
		const tree = familyTreeLayout(brunnerKeller, undefined, orders);
		expect(xOf(tree, 'peter')).toBeLessThan(xOf(tree, 'ursula'));
		expect(xOf(tree, 'ursula')).toBeLessThan(xOf(tree, 'hans'));
		expect(xOf(tree, 'hans')).toBeLessThan(xOf(tree, 'rosa'));
		// The Kellers' daughter now stands on their side, under them.
		expect(xOf(tree, 'sandra')).toBeLessThan(xOf(tree, 'daniel'));
		expect(crossings(brunnerKeller, tree)).toBe(0);
	});

	it('keeps an order that costs a longer bar over the search’s choice', () => {
		const row = familyTreeLayout(brunnerKeller).rows.find((r) => r.flat().includes('lena'))!;
		const order = [...row.flat()].reverse();
		const tree = familyTreeLayout(brunnerKeller, undefined, [order]);
		const xs = order.map((id) => xOf(tree, id));
		expect(xs).toEqual([...xs].sort((a, b) => a - b));
	});

	it('places a newcomer to an ordered row freely, the remembered ones still in order', () => {
		const orders = [['mia', 'luca']];
		const withSister: GraphModel = {
			nodes: [...twoFamilies.nodes, { id: 'zoe', kind: 'person', label: 'zoe' }],
			edges: [
				...twoFamilies.edges,
				{ id: 'p1', source: 'thomas', target: 'zoe', kind: 'relationship', typeKey: 'parent_child' }
			]
		};
		const tree = familyTreeLayout(withSister, undefined, orders);
		expect(xOf(tree, 'mia')).toBeLessThan(xOf(tree, 'luca'));
		expect(tree.positions.has('zoe')).toBe(true);
	});

	it('the same as without one when nothing is remembered', () => {
		expect(familyTreeLayout(brunnerKeller, undefined, []).positions).toEqual(
			familyTreeLayout(brunnerKeller).positions
		);
	});
});

describe('orderBreaks and inRememberedOrder', () => {
	const orders = [['a', 'b', 'c']];

	it('count each pair standing the other way round', () => {
		expect(orderBreaks([[['c'], ['b'], ['a']]], orders)).toBe(3);
		expect(orderBreaks([[['a'], ['x'], ['c']]], orders)).toBe(0);
	});

	it('set remembered units in order in their own places, a newcomer left where it stood', () => {
		expect(inRememberedOrder([[['c'], ['x'], ['a']]], orders)).toEqual([[['a'], ['x'], ['c']]]);
	});

	it('turn a couple round to the remembered way', () => {
		expect(inRememberedOrder([[['b', 'a']]], orders)).toEqual([[['a', 'b']]]);
	});
});
