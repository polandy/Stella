import { describe, expect, it } from 'bun:test';
import { listViewPreference, type ViewStorage } from './list-view-preference';

// Each member's own way of reading the household's list, kept by this browser (§2.25.6).

function memoryStorage(): ViewStorage {
	const entries = new Map<string, string>();
	return {
		getItem: (key) => entries.get(key) ?? null,
		setItem: (key, value) => void entries.set(key, value)
	};
}

const blocked: ViewStorage = {
	getItem: () => {
		throw new Error('SecurityError');
	},
	setItem: () => {
		throw new Error('SecurityError');
	}
};

describe('listViewPreference', () => {
	it('reads by person before anything was chosen', () => {
		expect(listViewPreference(memoryStorage(), 'andy').load()).toBe('person');
	});

	it('remembers the choice per member', () => {
		const storage = memoryStorage();
		listViewPreference(storage, 'andy').save('occasion');
		expect(listViewPreference(storage, 'andy').load()).toBe('occasion');
		expect(listViewPreference(storage, 'sandra').load()).toBe('person');
	});

	it('survives blocked storage', () => {
		const preference = listViewPreference(blocked, 'andy');
		expect(preference.load()).toBe('person');
		expect(() => preference.save('occasion')).not.toThrow();
	});
});
