import { describe, expect, test } from 'bun:test';
import { loadKeptPreferences } from './kept-preferences';

function memoryStorage(entries: Record<string, string> = {}) {
	const map = new Map(Object.entries(entries));
	return {
		getItem: (key: string) => map.get(key) ?? null,
		setItem: (key: string, value: string) => void map.set(key, value)
	};
}

describe('loadKeptPreferences', () => {
	test('reads the density this browser kept, and hands back a store for each habit', () => {
		const { stores, kept } = loadKeptPreferences(() =>
			memoryStorage({ 'stella.graph.density': 'spacious' })
		);

		expect(kept.density).toBe('spacious');
		expect(kept.switches).toBeDefined();
		expect(kept.savedViews).toEqual([]);
		expect(Object.keys(stores).sort()).toEqual(['density', 'switches', 'views']);
	});

	test('a store saves to the storage it was loaded from', () => {
		const storage = memoryStorage();
		const { stores } = loadKeptPreferences(() => storage);

		stores.density?.save('compact');

		expect(storage.getItem('stella.graph.density')).toBe('compact');
	});

	test('blocked storage keeps nothing and lets the defaults stand', () => {
		const { stores, kept } = loadKeptPreferences(() => {
			throw new DOMException('The operation is insecure.', 'SecurityError');
		});

		expect(kept).toEqual({});
		expect(stores).toEqual({});
	});
});
