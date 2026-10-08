import { describe, expect, it } from 'bun:test';
import { shelfCaptions } from './shelf-captions';
import type { GraphEdge, GraphModel, GraphNode } from './types';

/*
 * What the family tree writes under the people and circles on its "Outside the family" shelf
 * (docs/05 §5.8): without lines to read, a friend of Sandra's has to say so, and a circle which
 * of the people on the map are in it.
 */

const person = (id: string, wording: GraphNode['wording'] = 'neutral'): GraphNode => ({
	id,
	kind: 'person',
	label: `${id} Full`,
	shortName: id,
	wording
});
const circle = (id: string): GraphNode => ({ id, kind: 'circle', label: id });

const tie = (source: string, target: string, typeKey: string, label = typeKey): GraphEdge => ({
	id: `${source}-${typeKey}-${target}`,
	source,
	target,
	kind: 'relationship',
	category: ['parent_child', 'spouse'].includes(typeKey) ? 'family' : 'social',
	typeKey,
	label
});
const member = (circleId: string, personId: string): GraphEdge => ({
	id: `m-${circleId}-${personId}`,
	source: circleId,
	target: personId,
	kind: 'membership'
});

/** Lena's tree: her parents Markus and Sandra, grandfather Hans; friends and circles beneath. */
const nodes = [
	person('lena', 'female'),
	person('markus', 'male'),
	person('sandra', 'female'),
	person('hans', 'male'),
	person('mia', 'female'),
	person('nicole', 'female'),
	person('reto', 'male'),
	person('gerd', 'male'),
	circle('chor'),
	circle('turnverein'),
	circle('schule')
];
const edges = [
	tie('markus', 'lena', 'parent_child'),
	tie('sandra', 'lena', 'parent_child'),
	tie('markus', 'sandra', 'spouse'),
	tie('hans', 'markus', 'parent_child'),
	tie('lena', 'mia', 'friend'),
	tie('sandra', 'nicole', 'friend'),
	tie('markus', 'nicole', 'neighbor'),
	tie('hans', 'reto', 'colleague'),
	tie('gerd', 'hans', 'godparent_of', 'Godparent of'),
	member('chor', 'sandra'),
	member('turnverein', 'lena'),
	member('turnverein', 'sandra'),
	member('turnverein', 'markus'),
	member('turnverein', 'hans'),
	member('schule', 'noah')
];
const map: GraphModel = { nodes, edges };

describe('shelfCaptions', () => {
	const captions = shelfCaptions(map, map, 'lena');

	it('says nothing more for somebody tied to the centre: their role already says it', () => {
		expect(captions.has('mia')).toBe(false);
	});

	it('names who on the map somebody without a tie to the centre hangs off, by the far end', () => {
		// Nicole is Sandra's friend and Markus's neighbour. Both are Lena's parents, as close as
		// each other, so the name decides: Markus, and Sandra makes the "+1".
		expect(captions.get('nicole')).toEqual({
			kind: 'tie',
			role: { term: 'neighbor', variant: 'female' },
			anchor: 'markus',
			more: 1
		});
		// Reto hangs off Hans alone, one generation further from Lena.
		expect(captions.get('reto')).toEqual({
			kind: 'tie',
			role: { term: 'colleague', variant: 'male' },
			anchor: 'hans',
			more: 0
		});
	});

	it('takes a household’s own type by its words, where they read from the shelf person', () => {
		expect(captions.get('gerd')).toEqual({
			kind: 'tie',
			role: { label: 'Godparent of' },
			anchor: 'hans',
			more: 0
		});
		// The other way round there are no words for it, and so no caption.
		const turned = shelfCaptions(
			{
				nodes,
				edges: [
					...edges.filter((e) => e.typeKey !== 'godparent_of'),
					tie('hans', 'gerd', 'godparent_of')
				]
			},
			map,
			'lena'
		);
		expect(turned.has('gerd')).toBe(false);
	});

	it('names the people on the map a circle holds, the centre first, two at most', () => {
		expect(captions.get('chor')).toEqual({ kind: 'members', ids: ['sandra'], more: 0 });
		expect(captions.get('turnverein')).toEqual({
			kind: 'members',
			ids: ['lena', 'markus'],
			more: 2
		});
	});

	it('names nobody off the map, and says nothing for a circle without anyone on it', () => {
		const onMap: GraphModel = { nodes: nodes.filter((n) => n.id !== 'sandra'), edges };
		const fewer = shelfCaptions(map, onMap, 'lena');

		expect(fewer.get('nicole')).toMatchObject({ anchor: 'markus', more: 0 });
		expect(fewer.has('chor')).toBe(false);
		expect(fewer.has('schule')).toBe(false);
	});

	it('writes nothing for the family itself, only for the shelf', () => {
		for (const id of ['lena', 'markus', 'sandra', 'hans']) expect(captions.has(id), id).toBe(false);
	});

	it('centred on a circle, captions everybody by their ties and names a circle’s people by name', () => {
		// Nobody has a role towards the Chor, so Lena's friend Mia says whose friend she is; the
		// Chor itself is the centre, not on the shelf; and with no person at the centre to count
		// from, the Turnverein names its people by name alone.
		const aroundChor = shelfCaptions(map, map, 'chor');

		expect(aroundChor.get('mia')).toEqual({
			kind: 'tie',
			role: { term: 'friend', variant: 'female' },
			anchor: 'lena',
			more: 0
		});
		expect(aroundChor.has('chor')).toBe(false);
		expect(aroundChor.get('turnverein')).toEqual({
			kind: 'members',
			ids: ['hans', 'lena'],
			more: 2
		});
	});

	it('hangs a household’s own tie to the centre off the centre, before anybody else', () => {
		const withGodchild = shelfCaptions(
			{ nodes, edges: [...edges, tie('gerd', 'lena', 'godparent_of', 'Godparent of')] },
			map,
			'lena'
		);

		expect(withGodchild.get('gerd')).toEqual({
			kind: 'tie',
			role: { label: 'Godparent of' },
			anchor: 'lena',
			more: 1
		});
	});
});
