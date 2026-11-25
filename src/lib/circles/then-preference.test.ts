import { describe, expect, it } from 'bun:test';
import type { PreferenceStorage } from '#lib/gifts/waiting-preference.js';
import { showsThen, thenPreference } from './then-preference';

/* The browser's memory of *Then · Now* (docs/dev/02 §2.4.2): one choice for every circle. */

function memoryStorage(): PreferenceStorage & { items: Map<string, string> } {
	const items = new Map<string, string>();
	return {
		items,
		getItem: (key) => items.get(key) ?? null,
		setItem: (key, value) => void items.set(key, value)
	};
}

const blocked: PreferenceStorage = {
	getItem: () => {
		throw new Error('blocked');
	},
	setItem: () => {
		throw new Error('blocked');
	}
};

describe('thenPreference', () => {
	it('has no choice until the reader makes one', () => {
		expect(thenPreference(memoryStorage()).load()).toBeNull();
	});

	it('remembers the last choice', () => {
		const storage = memoryStorage();
		thenPreference(storage).save('then');
		expect(thenPreference(storage).load()).toBe('then');
		thenPreference(storage).save('now');
		expect(thenPreference(storage).load()).toBe('now');
		expect([...storage.items.keys()]).toEqual(['stella.circles.photos']);
	});

	it('ignores a stored value it does not know', () => {
		const storage = memoryStorage();
		storage.setItem('stella.circles.photos', 'sometimes');
		expect(thenPreference(storage).load()).toBeNull();
	});

	it('falls back to no choice when storage is blocked, and does not throw on save', () => {
		expect(thenPreference(blocked).load()).toBeNull();
		expect(() => thenPreference(blocked).save('then')).not.toThrow();
	});
});

describe('showsThen', () => {
	it('follows the circle’s default until the reader chooses', () => {
		expect(showsThen(null, true)).toBe(true);
		expect(showsThen(null, false)).toBe(false);
	});

	it('follows the reader’s choice on every circle', () => {
		expect(showsThen('now', true)).toBe(false);
		expect(showsThen('then', false)).toBe(true);
	});
});
