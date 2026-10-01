import { describe, expect, it } from 'bun:test';
import type { PreferenceStorage } from './density-preference';
import { DEFAULT_VIEW_SWITCHES, viewSwitchPreference } from './view-switches';

/*
 * The Filter menu's switches are a habit of the reader's, so this browser keeps them
 * (docs/05 §5.8). The storage is handed in: a map stands in for `localStorage` here.
 */

function memoryStorage(): PreferenceStorage & { entries: Map<string, string> } {
	const entries = new Map<string, string>();
	return {
		entries,
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

describe('viewSwitchPreference', () => {
	it('starts with line names and inner links on, grouping and every kinship line off', () => {
		expect(DEFAULT_VIEW_SWITCHES).toEqual({
			edgeLabels: true,
			groupRoles: false,
			innerLinks: true,
			allKinship: false
		});
		expect(viewSwitchPreference(memoryStorage()).load()).toEqual(DEFAULT_VIEW_SWITCHES);
	});

	it('remembers each switch under the key it has always been kept under', () => {
		const storage = memoryStorage();
		const store = viewSwitchPreference(storage);
		store.save('edgeLabels', false);
		store.save('groupRoles', true);
		store.save('innerLinks', false);
		store.save('allKinship', true);
		expect(Object.fromEntries(storage.entries)).toEqual({
			'stella.graph.edgeLabels': 'off',
			'stella.graph.groupByRole': 'on',
			'stella.graph.innerLinks': 'off',
			'stella.graph.allKinship': 'on'
		});
		expect(store.load()).toEqual({
			edgeLabels: false,
			groupRoles: true,
			innerLinks: false,
			allKinship: true
		});
	});

	it('reads anything but "on" as off for a switch that starts off, and the reverse', () => {
		const storage = memoryStorage();
		storage.entries.set('stella.graph.groupByRole', 'yes');
		storage.entries.set('stella.graph.edgeLabels', 'no');
		expect(viewSwitchPreference(storage).load()).toEqual({
			...DEFAULT_VIEW_SWITCHES,
			groupRoles: false,
			edgeLabels: true
		});
	});

	it('keeps the defaults when the browser refuses storage, and saves nothing loudly', () => {
		const store = viewSwitchPreference(blocked);
		expect(store.load()).toEqual(DEFAULT_VIEW_SWITCHES);
		expect(() => store.save('groupRoles', true)).not.toThrow();
	});
});
