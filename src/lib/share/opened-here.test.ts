import { describe, expect, it } from 'bun:test';
import { openedHere, type PreferenceStorage } from './opened-here';

function memoryStorage(): PreferenceStorage & { values: Map<string, string> } {
	const values = new Map<string, string>();
	return {
		values,
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => void values.set(key, value)
	};
}

describe('the people opened on this device', () => {
	it('remembers who was opened, newest first', () => {
		const list = openedHere(memoryStorage(), 'member-1');

		list.note('a');
		list.note('b');

		expect(list.load()).toEqual(['b', 'a']);
	});

	it('keeps each member’s own list', () => {
		const storage = memoryStorage();
		openedHere(storage, 'member-1').note('a');

		expect(openedHere(storage, 'member-2').load()).toEqual([]);
	});

	it('starts empty from anything it cannot read', () => {
		const storage = memoryStorage();
		const list = openedHere(storage, 'm');
		list.note('a');
		for (const key of storage.values.keys()) storage.values.set(key, '{not json');

		expect(list.load()).toEqual([]);
	});

	it('still works when the browser blocks storage', () => {
		const blocked: PreferenceStorage = {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			}
		};
		const list = openedHere(blocked, 'm');

		expect(() => list.note('a')).not.toThrow();
		expect(list.load()).toEqual([]);
	});
});
