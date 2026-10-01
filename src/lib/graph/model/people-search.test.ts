import { describe, expect, test } from 'bun:test';
import { matchPeople, peopleOf, SUGGESTION_LIMIT } from './people-search';
import type { GraphModel } from './types';

/*
 * Finding somebody on the explorer route (docs/05 §5.8): the people the graph holds, and the
 * handful the find field suggests for what was typed.
 */

const graph: GraphModel = {
	nodes: [
		{ id: 'z', kind: 'person', label: 'Zora' },
		{ id: 'k', kind: 'circle', label: 'Kegelclub' },
		{ id: 'a', kind: 'person', label: 'Anna' },
		{ id: 'm', kind: 'person', label: 'Mara' }
	],
	edges: []
};

describe('peopleOf', () => {
	test('lists the people only, by name', () => {
		expect(peopleOf(graph)).toEqual([
			{ id: 'a', displayName: 'Anna' },
			{ id: 'm', displayName: 'Mara' },
			{ id: 'z', displayName: 'Zora' }
		]);
	});
});

describe('matchPeople', () => {
	const people = peopleOf(graph);

	test('suggests nobody until something is typed', () => {
		expect(matchPeople(people, '')).toEqual([]);
		expect(matchPeople(people, '   ')).toEqual([]);
	});

	test('matches anywhere in the name, whatever the case, ignoring surrounding spaces', () => {
		expect(matchPeople(people, ' AR ').map((p) => p.id)).toEqual(['m']);
		expect(matchPeople(people, 'a').map((p) => p.id)).toEqual(['a', 'm', 'z']);
	});

	test('suggests a handful at most', () => {
		const many = Array.from({ length: SUGGESTION_LIMIT + 3 }, (_, i) => ({
			id: `p${i}`,
			displayName: `Person ${i}`
		}));
		expect(matchPeople(many, 'person')).toHaveLength(SUGGESTION_LIMIT);
		expect(SUGGESTION_LIMIT).toBe(6);
	});
});
