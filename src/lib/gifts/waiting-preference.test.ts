import { describe, expect, it } from 'bun:test';
import { waitingPreference, type PreferenceStorage } from './waiting-preference';

/*
 * Whether the household's list shows the ideas still waiting is each member's own habit, kept by
 * this browser (docs/dev/02 §2.25.8). A map stands in for `localStorage`.
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

describe('waitingPreference', () => {
	it('hides the waiting ideas before anything was chosen', () => {
		expect(waitingPreference(memoryStorage(), 'andy').load()).toBe(false);
	});

	it('remembers the choice, and hiding them again', () => {
		const storage = memoryStorage();
		waitingPreference(storage, 'andy').save(true);
		expect(waitingPreference(storage, 'andy').load()).toBe(true);
		waitingPreference(storage, 'andy').save(false);
		expect(waitingPreference(storage, 'andy').load()).toBe(false);
	});

	it('keeps each member’s choice apart on a shared device', () => {
		const storage = memoryStorage();
		waitingPreference(storage, 'andy').save(true);
		expect(waitingPreference(storage, 'eva').load()).toBe(false);
	});

	it('falls back to hiding them where storage is blocked, and saving does not throw', () => {
		const preference = waitingPreference(blocked, 'andy');
		expect(preference.load()).toBe(false);
		expect(() => preference.save(true)).not.toThrow();
	});
});
