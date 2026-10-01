import { describe, expect, it } from 'bun:test';
import { DEFAULT_DENSITY } from './layout/density';
import { densityPreference, type PreferenceStorage } from './density-preference';

/*
 * The graph's density is a habit of the reader's, so this browser keeps it (docs/05 §5.8).
 * The storage is handed in: a map stands in for `localStorage` here.
 */

function memoryStorage(): PreferenceStorage & { entries: Map<string, string> } {
	const entries = new Map<string, string>();
	return {
		entries,
		getItem: (key) => entries.get(key) ?? null,
		setItem: (key, value) => void entries.set(key, value)
	};
}

/** Storage a browser refuses — private mode, a blocked site — throws on every call. */
const blocked: PreferenceStorage = {
	getItem: () => {
		throw new Error('SecurityError');
	},
	setItem: () => {
		throw new Error('SecurityError');
	}
};

describe('densityPreference', () => {
	it('starts at the default before anything was chosen', () => {
		expect(densityPreference(memoryStorage()).load()).toBe(DEFAULT_DENSITY);
	});

	it('remembers what was chosen', () => {
		const storage = memoryStorage();
		densityPreference(storage).save('spacious');

		expect(densityPreference(storage).load()).toBe('spacious');
	});

	it('reads something it does not recognise as the default', () => {
		const storage = memoryStorage();
		storage.setItem('stella.graph.density', 'enormous');

		expect(densityPreference(storage).load()).toBe(DEFAULT_DENSITY);
	});

	it('keeps working where the browser refuses storage, just without remembering', () => {
		const preference = densityPreference(blocked);

		expect(() => preference.save('compact')).not.toThrow();
		expect(preference.load()).toBe(DEFAULT_DENSITY);
	});
});
