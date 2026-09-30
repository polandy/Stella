import { describe, expect, it } from 'bun:test';
import { BUILT_IN_RELATIONSHIP_TYPES } from '../../relationships/built-in-types';
import { builtInReplacingImportedType } from './relationship-types';

/*
 * An older Monica import created its own *Cousin of* and *Uncle/aunt of*; Stella has both
 * built in now, so Settings offers to fold each into the built-in (docs/monica-mapping.md).
 */

describe('builtInReplacingImportedType', () => {
	it('names the built-in that replaces a type an older import created', () => {
		expect(builtInReplacingImportedType('monica:reltype:cousin')).toBe('cousin');
		expect(builtInReplacingImportedType('monica:reltype:uncle_nephew')).toBe(
			'aunt_uncle_niece_nephew'
		);
	});

	it('names only types Stella really has built in', () => {
		const builtInIds = BUILT_IN_RELATIONSHIP_TYPES.map((type) => type.id);
		for (const id of ['monica:reltype:cousin', 'monica:reltype:uncle_nephew']) {
			expect(builtInIds).toContain(builtInReplacingImportedType(id)!);
		}
	});

	it('names nothing for a type the household made, or one still without a built-in', () => {
		expect(builtInReplacingImportedType('type-own')).toBeNull();
		expect(builtInReplacingImportedType('monica:reltype:godparent_godchild')).toBeNull();
	});
});
