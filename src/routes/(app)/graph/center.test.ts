import { describe, expect, it } from 'bun:test';
import { chooseCenter, type CentrableNode } from './center';

/*
 * Where the explorer opens (docs/02 §2.7, §2.1.3): what was asked for, else me, else anyone.
 */

const nodes: CentrableNode[] = [
	{ id: 'c-anna', kind: 'person' },
	{ id: 'c-me', kind: 'person' },
	{ id: 'circle-1', kind: 'circle' }
];

describe('chooseCenter', () => {
	it('opens on the person the link asks for', () => {
		expect(chooseCenter(nodes, 'c-anna', 'c-me')).toBe('c-anna');
	});

	it('opens on my own person when nothing was asked for', () => {
		expect(chooseCenter(nodes, null, 'c-me')).toBe('c-me');
	});

	it('falls back to the first visible person when I have not said who I am', () => {
		expect(chooseCenter(nodes, null, null)).toBe('c-anna');
	});

	it('ignores anyone outside the visible graph, asked for or not', () => {
		// A stale link, and a "me" whose record this member may no longer see.
		expect(chooseCenter(nodes, 'c-hidden', 'c-me')).toBe('c-me');
		expect(chooseCenter(nodes, null, 'c-hidden')).toBe('c-anna');
	});

	it('answers null when there is no person to open on', () => {
		expect(chooseCenter([{ id: 'circle-1', kind: 'circle' }], null, 'c-me')).toBeNull();
	});
});
