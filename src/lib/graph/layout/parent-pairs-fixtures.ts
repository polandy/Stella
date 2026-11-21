import type { ParentKind } from '../../relationships/parent-kinds';
import type { GraphEdge, GraphModel, GraphNode } from '../model/types';

/* Test support: a child with several parent pairs, for the family tree's tests (docs/dev/05 §5.8). */

const person = (id: string): GraphNode => ({ id, kind: 'person', label: id });
const stored = (source: string, target: string, typeKey: string): GraphEdge => ({
	id: `${source}-${typeKey}-${target}`,
	source,
	target,
	kind: 'relationship',
	category: 'family',
	typeKey
});
export const parentOf = (
	parent: string,
	child: string,
	kind?: Exclude<ParentKind, 'biological'>
) => ({
	...stored(parent, child, 'parent_child'),
	...(kind ? { parentKind: kind } : {})
});

/**
 * Lena with four pairs of parents: Mara and Tom, her biological parents, apart now; Karl, Mara's
 * husband, her step-father; Jonas and Eva, who adopted her, with their own son Noah; and Ruth,
 * her foster mother once, with her own son Ben.
 */
export const lenaParentPairs: GraphModel = {
	nodes: ['ruth', 'ben', 'karl', 'lena', 'eva', 'tom', 'noah', 'mara', 'jonas'].map(person),
	edges: [
		{ ...stored('mara', 'tom', 'spouse'), former: true },
		stored('mara', 'karl', 'spouse'),
		stored('jonas', 'eva', 'spouse'),
		parentOf('mara', 'lena'),
		parentOf('tom', 'lena'),
		parentOf('karl', 'lena', 'step'),
		parentOf('jonas', 'lena', 'adoptive'),
		parentOf('eva', 'lena', 'adoptive'),
		{ ...parentOf('ruth', 'lena', 'foster'), former: true },
		parentOf('jonas', 'noah'),
		parentOf('eva', 'noah'),
		parentOf('ruth', 'ben')
	]
};
