import { describe, expect, it } from 'bun:test';
import { BUILT_IN_RELATIONSHIP_TYPES } from '$lib/server/domain/relationships/built-in-types';
import { RELATION_FOR_TYPE_KEY, TYPE_KEY_FOR_RELATION } from '$lib/relationships/type-keys';
import { RELATIONS } from './types';

/*
 * Every relation a suggestion can name is stored as one built-in type, and back again
 * (docs/concepts/relationship-suggestions.md §6.1): *Accept* posts the type, a declined claim
 * is logged by the relation, and the two must never drift apart.
 */

describe('relations and the types they are stored as', () => {
	it('stores every relation as a built-in type', () => {
		const builtIn = new Set(BUILT_IN_RELATIONSHIP_TYPES.map((type) => type.key));
		expect(RELATIONS.filter((relation) => !builtIn.has(TYPE_KEY_FOR_RELATION[relation]))).toEqual(
			[]
		);
	});

	it('reads each type back as the relation it was stored for', () => {
		expect(
			RELATIONS.map((relation) => RELATION_FOR_TYPE_KEY[TYPE_KEY_FOR_RELATION[relation]])
		).toEqual([...RELATIONS]);
	});
});
