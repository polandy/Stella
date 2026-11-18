import { describe, expect, it } from 'bun:test';
import { KEPT_TREES, treeOrderPreference } from './tree-order-preference';
import type { PreferenceStorage } from './density-preference';

const memory = (
	initial: Record<string, string> = {}
): PreferenceStorage & { raw: Map<string, string> } => {
	const raw = new Map(Object.entries(initial));
	return {
		raw,
		getItem: (key) => raw.get(key) ?? null,
		setItem: (key, value) => void raw.set(key, value)
	};
};

describe('treeOrderPreference', () => {
	it('keeps each centre person’s tree its own orders', () => {
		const pref = treeOrderPreference(memory());
		pref.save('lena', [['a', 'b']]);
		pref.save('noah', [['c', 'd']]);
		expect(pref.load('lena')).toEqual([['a', 'b']]);
		expect(pref.load('noah')).toEqual([['c', 'd']]);
		expect(pref.load('timo')).toEqual([]);
	});

	it('forgets the longest untouched tree past the most it keeps', () => {
		const pref = treeOrderPreference(memory());
		for (let i = 0; i <= KEPT_TREES; i++) pref.save(`p${i}`, [['a', 'b']]);
		expect(pref.load('p0')).toEqual([]);
		expect(pref.load(`p${KEPT_TREES}`)).toEqual([['a', 'b']]);
	});

	it('reads a damaged entry as nothing remembered', () => {
		expect(treeOrderPreference(memory({ 'stella.graph.treeOrders': '{oops' })).load('a')).toEqual(
			[]
		);
		expect(
			treeOrderPreference(memory({ 'stella.graph.treeOrders': '[["a", [[1]]]]' })).load('a')
		).toEqual([]);
	});

	it('remembers nothing where storage is blocked, without failing', () => {
		const blocked: PreferenceStorage = {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			}
		};
		const pref = treeOrderPreference(blocked);
		pref.save('a', [['x']]);
		expect(pref.load('a')).toEqual([]);
	});
});
