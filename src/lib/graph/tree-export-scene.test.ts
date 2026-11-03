import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import { exportScene, type SceneInput } from './tree-export-scene';
import type { GraphEdge, GraphModel, GraphNode } from './model/types';

/*
 * The family tree as it leaves the household (docs/02 §2.7): the tree on screen, less the
 * private people unless asked, with the years under the names when asked.
 */

const person = (id: string, extra: Partial<GraphNode> = {}): GraphNode => ({
	id,
	kind: 'person',
	label: id[0].toUpperCase() + id.slice(1),
	wording: 'male',
	...extra
});

const tie = (source: string, target: string, typeKey: string): GraphEdge => ({
	id: `${source}-${typeKey}-${target}`,
	source,
	target,
	kind: 'relationship',
	category: typeKey === 'friend' ? 'social' : 'family',
	typeKey,
	label: typeKey
});

/** Lena's tree: her father Markus, born 1960; Nicole, Markus's friend, is private. */
const graph: GraphModel = {
	nodes: [
		person('lena', { wording: 'female' }),
		person('markus', { born: 1960, died: 2020, deceased: true }),
		person('nicole', { wording: 'female', private: true })
	],
	edges: [tie('markus', 'lena', 'parent_child'), tie('markus', 'nicole', 'friend')]
};

const input = (over: Partial<SceneInput> = {}): SceneInput => ({
	graph,
	shown: graph,
	centerId: 'lena',
	rolesInstead: true,
	allKinship: false,
	choices: { dates: false, withPrivate: false },
	t: createTranslator('en'),
	...over
});

const roleOf = (scene: ReturnType<typeof exportScene>, id: string) =>
	scene.elements.find((e) => e.data.id === id)?.data.role;

describe('exportScene', () => {
	it('leaves a private person out, and the line to them', () => {
		const scene = exportScene(input());
		expect(scene.model.nodes.map((n) => n.id)).toEqual(['lena', 'markus']);
		expect(scene.elements.some((e) => e.data.id === 'nicole')).toBe(false);
		expect(scene.elements.filter((e) => e.group === 'edges')).toHaveLength(1);
	});

	it('takes a private person along when asked, with what they are to the family', () => {
		const scene = exportScene(input({ choices: { dates: false, withPrivate: true } }));
		expect(roleOf(scene, 'nicole')).toBe('Friend of Markus');
	});

	it('writes each role towards the centre under the name', () => {
		expect(roleOf(exportScene(input()), 'markus')).toBe('Father');
		expect(exportScene(input()).underNames).toBe(true);
	});

	it('adds the years on a line of their own when asked', () => {
		const scene = exportScene(input({ choices: { dates: true, withPrivate: false } }));
		expect(roleOf(scene, 'markus')).toBe('Father\n1960 – 2020');
		expect(roleOf(scene, 'lena')).toBe('');
	});

	it('around a circle there are no roles, only the years', () => {
		const plain = exportScene(input({ rolesInstead: false }));
		expect(roleOf(plain, 'markus')).toBe('');
		expect(plain.underNames).toBe(false);
		const dated = exportScene(
			input({ rolesInstead: false, choices: { dates: true, withPrivate: false } })
		);
		expect(roleOf(dated, 'markus')).toBe('1960 – 2020');
		expect(dated.underNames).toBe(true);
	});

	it('a private centre left out takes the roles with it', () => {
		const hidden = { ...graph, nodes: graph.nodes.map((n) => ({ ...n, private: true as const })) };
		const scene = exportScene(input({ graph: hidden, shown: hidden }));
		expect(scene.model.nodes).toHaveLength(0);
		expect(scene.underNames).toBe(false);
	});

	it('draws only the lines the tree on screen draws', () => {
		// A derived grandparent line repeats the two parent lines it is worked out from.
		const derived: GraphEdge = {
			id: 'kin:hans:lena',
			source: 'hans',
			target: 'lena',
			kind: 'relationship',
			category: 'family',
			derived: true,
			kin: { term: 'grandparent', variant: 'male' }
		};
		const family: GraphModel = {
			nodes: [...graph.nodes, person('hans')],
			edges: [...graph.edges, tie('hans', 'markus', 'parent_child'), derived]
		};
		const scene = exportScene(input({ graph: family, shown: family }));
		expect(scene.model.edges.some((e) => e.id === derived.id)).toBe(true);
		expect(scene.elements.some((e) => e.data.id === derived.id)).toBe(false);
	});
});
