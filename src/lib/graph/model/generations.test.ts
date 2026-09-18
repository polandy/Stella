import { describe, expect, it } from 'bun:test';
import { familiesOf, generationsOf } from './generations';
import type { GraphEdge, GraphModel, GraphNode } from './types';

/*
 * Which generation each person on the map belongs to, read off the family links alone — what
 * the family-tree arrangement puts into rows (docs/02 §2.7, docs/05 §5.8).
 */

const person = (id: string): GraphNode => ({ id, kind: 'person', label: id });

const stored = (source: string, target: string, typeKey: string): GraphEdge => ({
	id: `${source}-${typeKey}-${target}`,
	source,
	target,
	kind: 'relationship',
	category: 'family',
	typeKey
});

const parentOf = (parent: string, child: string) => stored(parent, child, 'parent_child');

function model(ids: string[], edges: GraphEdge[]): GraphModel {
	return { nodes: ids.map(person), edges };
}

describe('generationsOf', () => {
	it('puts a child one generation below its parent, the oldest at the top', () => {
		const generations = generationsOf(
			model(['otto', 'hans', 'lena'], [parentOf('otto', 'hans'), parentOf('hans', 'lena')])
		);

		expect(Object.fromEntries(generations)).toEqual({ otto: 0, hans: 1, lena: 2 });
	});

	it('keeps partners and siblings on the same generation', () => {
		const generations = generationsOf(
			model(
				['hans', 'eva', 'lena', 'tom'],
				[
					parentOf('hans', 'lena'),
					stored('hans', 'eva', 'spouse'),
					stored('lena', 'tom', 'sibling')
				]
			)
		);

		expect(generations.get('eva')).toBe(generations.get('hans'));
		expect(generations.get('tom')).toBe(generations.get('lena'));
		expect(generations.get('lena')).toBe(generations.get('hans')! + 1);
	});

	it('spans two generations for a stored grandparent', () => {
		const generations = generationsOf(
			model(['otto', 'lena'], [stored('otto', 'lena', 'grandparent_grandchild')])
		);

		expect(generations.get('lena')).toBe(generations.get('otto')! + 2);
	});

	it('places a relative only the worked-out kinship ties to the map', () => {
		// Timo's parents are not on the canvas, only the dotted cousin line to Lena is.
		const generations = generationsOf(
			model(
				['hans', 'lena', 'timo'],
				[
					parentOf('hans', 'lena'),
					{
						id: 'kin:lena:timo',
						source: 'timo',
						target: 'lena',
						kind: 'kinship',
						kin: { term: 'cousin', variant: 'neutral' },
						derived: true
					}
				]
			)
		);

		expect(generations.get('timo')).toBe(generations.get('lena'));
	});

	it('lets an entered link win over a worked-out one that disagrees', () => {
		const generations = generationsOf(
			model(
				['hans', 'lena'],
				[
					{
						id: 'kin:hans:lena',
						source: 'hans',
						target: 'lena',
						kind: 'kinship',
						kin: { term: 'grandparent', variant: 'neutral' },
						derived: true
					},
					parentOf('hans', 'lena')
				]
			)
		);

		expect(generations.get('lena')).toBe(generations.get('hans')! + 1);
	});

	it('leaves out people and circles with no family link, rather than guessing', () => {
		const generations = generationsOf({
			nodes: [
				person('hans'),
				person('lena'),
				person('sara'),
				{ id: 'ski', kind: 'circle', label: 'Ski' }
			],
			edges: [
				parentOf('hans', 'lena'),
				{
					id: 'w',
					source: 'hans',
					target: 'sara',
					kind: 'relationship',
					category: 'professional',
					typeKey: 'colleague'
				},
				{ id: 'm', source: 'ski', target: 'hans', kind: 'membership' }
			]
		});

		expect([...generations.keys()].sort()).toEqual(['hans', 'lena']);
	});

	it('starts every separate family at the top', () => {
		const generations = generationsOf(
			model(['otto', 'hans', 'anna', 'bert'], [parentOf('otto', 'hans'), parentOf('anna', 'bert')])
		);

		expect(generations.get('otto')).toBe(0);
		expect(generations.get('anna')).toBe(0);
	});

	it('tells separate families apart', () => {
		const families = familiesOf(
			model(['otto', 'hans', 'anna', 'bert'], [parentOf('otto', 'hans'), parentOf('anna', 'bert')])
		);

		expect(families.map((f) => [...f.keys()].sort())).toEqual([
			['hans', 'otto'],
			['anna', 'bert']
		]);
	});

	it('survives links that contradict each other', () => {
		// Nobody can be their own grandparent; the map still has to be drawn.
		const generations = generationsOf(
			model(['a', 'b', 'c'], [parentOf('a', 'b'), parentOf('b', 'c'), parentOf('c', 'a')])
		);

		expect(generations.size).toBe(3);
		expect(Math.min(...generations.values())).toBe(0);
	});
});
