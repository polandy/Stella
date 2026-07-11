import { describe, expect, it } from 'bun:test';
import { accentFor, toCytoscapeElements } from './elements';
import type { GraphModel } from '../model/types';

/*
 * Pure GraphModel → Cytoscape element mapping (docs/04 §4.11). No library, no DOM.
 */

const model: GraphModel = {
	nodes: [
		{ id: 'mara', kind: 'person', label: 'Mara' },
		{ id: 'walter', kind: 'person', label: 'Walter', deceased: true },
		{ id: 'kegel', kind: 'circle', label: 'Kegelclub' }
	],
	edges: [
		{ id: 'r1', source: 'mara', target: 'walter', kind: 'relationship', category: 'family', directed: true },
		{ id: 'm1', source: 'kegel', target: 'mara', kind: 'membership' },
		{ id: 'dangling', source: 'mara', target: 'ghost', kind: 'relationship', category: 'social' }
	]
};

describe('accentFor', () => {
	it('is deterministic and within the accent set', () => {
		expect(accentFor('mara')).toBe(accentFor('mara'));
	});
	it('varies between different ids', () => {
		const accents = new Set(['a', 'b', 'c', 'd', 'e'].map(accentFor));
		expect(accents.size).toBeGreaterThan(1);
	});
});

describe('toCytoscapeElements', () => {
	const els = toCytoscapeElements(model, { centerId: 'mara' });
	const node = (id: string) => els.find((e) => e.group === 'nodes' && e.data.id === id);
	const edge = (id: string) => els.find((e) => e.group === 'edges' && e.data.id === id);

	it('marks the centre and classes people vs circles', () => {
		expect(node('mara')?.classes).toContain('center');
		expect(node('mara')?.classes).toContain('person');
		expect(node('kegel')?.classes).toContain('circle');
	});

	it('flags deceased and gives circles the lavender accent', () => {
		expect(node('walter')?.classes).toContain('deceased');
		expect(node('kegel')?.data.accent).toBe('lavender');
		expect(node('mara')?.data.accent).toBe(accentFor('mara'));
	});

	it('encodes edge kind, category, and direction', () => {
		expect(edge('r1')?.data).toMatchObject({ kind: 'relationship', category: 'family', directed: 1 });
		expect(edge('m1')?.data).toMatchObject({ kind: 'membership', directed: 0 });
	});

	it('drops edges whose endpoint is not a present node', () => {
		expect(edge('dangling')).toBeUndefined();
	});

	it('computes node degree from drawn edges only', () => {
		// mara touches r1 and m1 (dangling is dropped) → degree 2
		expect(node('mara')?.data.degree).toBe(2);
		expect(node('kegel')?.data.degree).toBe(1);
	});
});
