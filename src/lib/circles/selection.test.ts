import { describe, expect, it } from 'bun:test';
import { allChosen, toggleEveryone, toggleGroup, toggleMember } from './selection';

/*
 * Choosing several members of a circle to re-role or remove them together (docs/02 §2.4.2).
 * The page holds the selection as a list of contact ids; these are the rules for changing it.
 */

describe('toggleMember', () => {
	it('adds someone who is not chosen yet, after those already chosen', () => {
		expect(toggleMember(['a'], 'b')).toEqual(['a', 'b']);
	});

	it('takes someone out who is chosen, leaving the rest', () => {
		expect(toggleMember(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
	});
});

describe('allChosen', () => {
	it('is true only when every one of the group is chosen', () => {
		expect(allChosen(['a', 'b'], ['b', 'a', 'z'])).toBe(true);
		expect(allChosen(['a', 'b'], ['a'])).toBe(false);
	});

	it('is false for an empty group, so an empty heading never reads as "all chosen"', () => {
		expect(allChosen([], ['a'])).toBe(false);
	});
});

describe('toggleGroup', () => {
	it('chooses the whole group, keeping people chosen elsewhere and never listing anyone twice', () => {
		expect(toggleGroup(['z', 'a'], ['a', 'b'])).toEqual(['z', 'a', 'b']);
	});

	it('lets go of the whole group when all of it was chosen, keeping people chosen elsewhere', () => {
		expect(toggleGroup(['z', 'a', 'b'], ['a', 'b'])).toEqual(['z']);
	});
});

describe('toggleEveryone', () => {
	const everyone = ['a', 'b', 'c'];

	it('chooses everyone when someone is still out', () => {
		expect(toggleEveryone(['a'], everyone)).toEqual(everyone);
	});

	it('chooses no one once everyone is chosen', () => {
		expect(toggleEveryone(['c', 'a', 'b'], everyone)).toEqual([]);
	});
});
