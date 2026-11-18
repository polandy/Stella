import { describe, expect, it } from 'bun:test';
import { familyTreeLayout } from './family-tree';
import type { SizeOf } from './geometry';
import { barSpans, crossingBars } from './tree-lines';
import {
	brunnerKeller,
	brunnerKellerWidened,
	pollari,
	pollariSizeOf,
	twoFamilies,
	twoHouseholds
} from './family-fixtures';
import { applyFilters } from '../model/graph-model';
import type { GraphFilters, GraphModel } from '../model/types';

/*
 * The order of each family's rows in the family tree (docs/dev/05 §5.8, `family-rows.ts`): no bar
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

	describe('stands co-parents and the partners who married in where the bars stay clear', () => {
		const measured: SizeOf = (id) => ({ width: 50 + 9 * id.length, height: 64 });
		/** Every order the people can arrive in: each rotation, forwards and backwards. */
		const arrivals = (model: GraphModel) =>
			model.nodes.flatMap((_, k) => {
				const rotated = [...model.nodes.slice(k), ...model.nodes.slice(0, k)];
				return [rotated, [...rotated].reverse()];
			});
		/** Who stands on the row strictly between the outermost of `ids`, apart from them. */
		const between = (model: GraphModel, ids: string[]) => {
			const sizeOf = model.nodes.some((n) => n.id === 'leo') ? pollariSizeOf : measured;
			const { positions } = familyTreeLayout(model, sizeOf);
			const xs = ids.map((id) => positions.get(id)!.x);
			const y = positions.get(ids[0])!.y;
			return [...positions]
				.filter(([id, p]) => !ids.includes(id) && p.y === y)
				.filter(([, p]) => p.x > Math.min(...xs) && p.x < Math.max(...xs))
				.map(([id]) => id);
		};

		it('keeps two parents of the same children together without a partnership entered', () => {
			const apart = arrivals(pollari).flatMap((nodes) => [
				...between({ ...pollari, nodes }, ['francesco', 'wingkam']),
				...between({ ...pollari, nodes }, ['pasquale', 'slotF'])
			]);
			expect(apart).toEqual([]);
		});

		it('turns co-parents husband-left like any couple', () => {
			const { positions } = familyTreeLayout(pollari, pollariSizeOf);
			const x = (id: string) => positions.get(id)!.x;
			expect(x('francesco')).toBeLessThan(x('wingkam'));
		});

		it('sets a partner from outside at the edge of their partner’s siblings', () => {
			const under = arrivals(pollari).flatMap((nodes) =>
				between({ ...pollari, nodes }, ['linda', 'andy', 'steve', 'sebi'])
			);
			expect(under).toEqual([]);
			const widened = arrivals(brunnerKellerWidened).flatMap((nodes) => [
				...between({ ...brunnerKellerWidened, nodes }, ['daniel', 'markus']),
				...between({ ...brunnerKellerWidened, nodes }, ['corinne', 'sandra'])
			]);
			expect(widened).toEqual([]);
		});
	});

	describe('keeps its order when a filter takes lines away', () => {
		const measured: SizeOf = (id) => ({ width: 50 + 9 * id.length, height: 64 });
		const formerCouple: GraphModel = {
			...twoFamilies,
			edges: twoFamilies.edges.map((e) => (e.typeKey === 'spouse' ? { ...e, former: true } : e))
		};
		const cases: [string, GraphModel, GraphFilters][] = [
			['pollari, family lines only', pollari, { categories: ['family'] }],
			['brunnerKellerWidened, family lines only', brunnerKellerWidened, { categories: ['family'] }],
			['a former couple, former links off', formerCouple, { hideFormer: true }]
		];
		for (const [name, model, filters] of cases) {
			it(`in ${name}`, () => {
				const whole = familyTreeLayout(model, measured).positions;
				const filtered = applyFilters(model, filters);
				expect(filtered.edges.length).toBeLessThan(model.edges.length);
				const kept = familyTreeLayout(filtered, measured, [], model.edges).positions;
				expect([...kept]).toEqual([...whole].filter(([id]) => kept.has(id)));
			});
		}
	});
});
