import { describe, expect, it } from 'bun:test';
import { familyTreeLayout } from './family-tree';
import type { SizeOf } from './geometry';
import { barSpans, crossingBars } from './tree-lines';
import { brunnerKeller, brunnerKellerWidened, twoFamilies, twoHouseholds } from './family-fixtures';
import type { GraphModel } from '../model/types';

/*
 * The order of each family's rows in the family tree (docs/05 §5.8, `family-rows.ts`): no bar
 * crosses another, an only child hangs straight under the drop, the father's side on the left.
 * Read through the whole arrangement, as the map draws it.
 */

describe('arrangeFamily', () => {
	describe('keeps each family together, so no bar crosses another', () => {
		// Names of every length, as the canvas measures them, not one width for all.
		const measured: SizeOf = (id) => ({ width: 50 + 9 * id.length, height: 64 });
		const crossings = (model: GraphModel) => {
			const { positions } = familyTreeLayout(model, measured);
			const members = new Set(model.nodes.map((n) => n.id));
			return crossingBars(barSpans(model.edges, positions, members));
		};

		for (const [name, model] of Object.entries({
			twoHouseholds,
			brunnerKeller,
			brunnerKellerWidened,
			twoFamilies
		})) {
			it(`in ${name}, whatever order the map lists its people in`, () => {
				// A bar for every couple with children on the map, and not one of them crossed —
				// for every order the people can arrive in, since a map grows from whoever it is
				// centred on.
				const { positions } = familyTreeLayout(model);
				expect(barSpans(model.edges, positions, new Set(positions.keys())).length).toBeGreaterThan(
					1
				);
				const orders = model.nodes.flatMap((_, k) => {
					const rotated = [...model.nodes.slice(k), ...model.nodes.slice(0, k)];
					return [rotated, [...rotated].reverse()];
				});
				const crossed = orders.filter((nodes) => crossings({ ...model, nodes }) > 0);
				expect(crossed.map((nodes) => nodes.map((n) => n.id).join(','))).toEqual([]);
			});
		}
	});

	describe('drops straight down to an only child', () => {
		// Daniel's one son Timo on the row below: a bar with a jog in it would be a bar for one.
		const measured: SizeOf = (id) => ({ width: 50 + 9 * id.length, height: 64 });
		for (const [name, model] of Object.entries({
			brunnerKeller,
			brunnerKellerWidened,
			twoFamilies
		})) {
			it(`in ${name}`, () => {
				const { positions, routes } = familyTreeLayout(model, measured);
				const members = new Set(positions.keys());
				const spans = barSpans(model.edges, positions, members);
				// Every drop to an only child is a single straight line: no bar at all.
				const onlyChildren = model.edges.filter((e) => {
					if (e.typeKey !== 'parent_child') return false;
					const route = routes?.get(e.id);
					return route !== undefined && new Set(route.waypoints.map((p) => p.x)).size > 1;
				});
				expect(onlyChildren.map((e) => e.id)).toEqual(
					model.edges
						.filter((e) => e.typeKey === 'parent_child')
						.filter((e) => {
							const siblings = model.edges.filter(
								(f) => f.typeKey === 'parent_child' && f.source === e.source
							);
							return siblings.length > 1;
						})
						.map((e) => e.id)
				);
				// And straightening never buys a crossing.
				expect(crossingBars(spans)).toBe(0);
			});
		}

		it('puts Timo right under his father', () => {
			const { positions } = familyTreeLayout(brunnerKeller, measured);

			expect(positions.get('timo')!.x).toBe(positions.get('daniel')!.x);
		});
	});

	it('sets siblings side by side, the father’s family on the left and the mother’s on the right', () => {
		const { positions } = familyTreeLayout(brunnerKeller);
		const x = (id: string) => positions.get(id)!.x;
		const order = (ids: string[]) => [...ids].sort((a, b) => x(a) - x(b));

		// Hans and Rosa above Markus, Peter and Ursula above Sandra: his side left, hers right.
		expect(order(['hans', 'rosa', 'peter', 'ursula']).slice(0, 2).sort()).toEqual(['hans', 'rosa']);
		expect(order(['daniel', 'markus', 'sandra', 'corinne'])).toEqual([
			'daniel',
			'markus',
			'sandra',
			'corinne'
		]);
		// Lena and her brothers stand together, their cousin outside the three.
		const children = order(['lena', 'noah', 'elias', 'timo']);
		expect(children[0] === 'timo' || children[3] === 'timo').toBe(true);
	});
});
