import { describe, expect, it } from 'bun:test';
import { DEFAULT_VIEW_SWITCHES } from './view-switches';
import type { PreferenceStorage } from './density-preference';
import { saveView } from './model/saved-views';
import { savedViewsPreference } from './saved-views-preference';

/*
 * Saved views are kept per device (docs/02 §2.7). What a stored list means is decided in
 * `model/saved-views.ts`; this adapter only reads and writes it. A map stands in for
 * `localStorage`.
 */

function memoryStorage(): PreferenceStorage {
	const entries = new Map<string, string>();
	return {
		getItem: (key) => entries.get(key) ?? null,
		setItem: (key, value) => void entries.set(key, value)
	};
}

const blocked: PreferenceStorage = {
	getItem: () => {
		throw new Error('SecurityError');
	},
	setItem: () => {
		throw new Error('SecurityError');
	}
};

const views = saveView([], 'Family', {
	active: new Set(['family']),
	switches: { ...DEFAULT_VIEW_SWITCHES }
});

describe('savedViewsPreference', () => {
	it('has no views before any was saved', () => {
		expect(savedViewsPreference(memoryStorage()).load()).toEqual([]);
	});

	it('remembers the views it was given', () => {
		const storage = memoryStorage();
		savedViewsPreference(storage).save(views);

		expect(savedViewsPreference(storage).load()).toEqual(views);
	});

	it('keeps working where the browser refuses storage, just without remembering', () => {
		const preference = savedViewsPreference(blocked);

		expect(() => preference.save(views)).not.toThrow();
		expect(preference.load()).toEqual([]);
	});
});
