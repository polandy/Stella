import { describe, expect, it } from 'bun:test';
import { chooseCenter, chosenPathTarget, type CentrableNode } from './center';

/*
 * Where the explorer opens (docs/02 §2.7, §2.1.3): what was asked for, else me, else anyone.
 */

const nodes: CentrableNode[] = [
	{ id: 'c-anna', kind: 'person' },
	{ id: 'c-me', kind: 'person' },
	{ id: 'circle-1', kind: 'circle' }
];

describe('chooseCenter', () => {
	it('opens on the person the link asks for, and remembers that it was asked', () => {
		expect(chooseCenter(nodes, 'c-anna', 'c-me')).toEqual({ id: 'c-anna', asked: true });
	});

	it('opens on my own person when nothing was asked for', () => {
		expect(chooseCenter(nodes, null, 'c-me')).toEqual({ id: 'c-me', asked: false });
	});

	it('falls back to the first visible person when I have not said who I am', () => {
		expect(chooseCenter(nodes, null, null)).toEqual({ id: 'c-anna', asked: false });
	});

	it('ignores anyone outside the visible graph, asked for or not', () => {
		// A stale link, and a "me" whose record this member may no longer see.
		expect(chooseCenter(nodes, 'c-hidden', 'c-me')).toEqual({ id: 'c-me', asked: false });
		expect(chooseCenter(nodes, null, 'c-hidden')).toEqual({ id: 'c-anna', asked: false });
	});

	it('owes no way back when the link named somebody the viewer cannot see', () => {
		// Falling back must not offer "back to" a page the member could not have come from.
		expect(chooseCenter(nodes, 'c-hidden', 'c-me').asked).toBe(false);
	});

	it('answers null when there is no person to open on', () => {
		expect(chooseCenter([{ id: 'circle-1', kind: 'circle' }], null, 'c-me')).toEqual({
			id: null,
			asked: false
		});
	});
});

describe('chosenPathTarget', () => {
	it('names the person a link asks to trace to', () => {
		expect(chosenPathTarget(nodes, 'c-anna', 'c-me')).toBe('c-anna');
	});

	it('names nobody when the link asks for nothing', () => {
		expect(chosenPathTarget(nodes, null, 'c-me')).toBeNull();
	});

	it('refuses somebody outside the visible graph, as the centre does', () => {
		expect(chosenPathTarget(nodes, 'c-hidden', 'c-me')).toBeNull();
	});

	it('refuses the centre itself, which would be a chain of one', () => {
		expect(chosenPathTarget(nodes, 'c-me', 'c-me')).toBeNull();
	});

	it('names a circle too: a path may run through a shared context', () => {
		expect(chosenPathTarget(nodes, 'circle-1', 'c-me')).toBe('circle-1');
	});
});
