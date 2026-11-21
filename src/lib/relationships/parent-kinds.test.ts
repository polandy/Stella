import { describe, expect, it } from 'bun:test';
import { isParentKind, maxParentsOf, PARENT_KINDS } from './parent-kinds';

describe('parent kinds', () => {
	it('caps biological and adoptive parents at two each, foster and step not at all', () => {
		expect(PARENT_KINDS.map(maxParentsOf)).toEqual([2, 2, null, null]);
	});

	it('knows the four kinds and nothing else', () => {
		expect(PARENT_KINDS.every(isParentKind)).toBe(true);
		expect(isParentKind('godparent')).toBe(false);
		expect(isParentKind('')).toBe(false);
	});
});
