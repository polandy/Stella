import { describe, expect, it } from 'bun:test';
import { refreshPeopleIfChanged, shellReloads } from './people-freshness';

/*
 * The shell's list of people stays as fresh as a page's own copy would be (docs/04 §4.9):
 * after a navigation the stamp of what the server would send now is compared with the one the
 * list came with, and only a difference reloads it.
 */

function harness(answer: () => Promise<string>) {
	const reloads: string[] = [];
	return {
		reloads,
		deps: {
			fetchStamp: answer,
			reload: async () => {
				reloads.push('people');
			}
		}
	};
}

describe('refreshPeopleIfChanged', () => {
	it('reloads the list when someone was added, changed or removed since it was sent', async () => {
		const h = harness(async () => 'stamp-2');
		expect(await refreshPeopleIfChanged(h.deps, 'stamp-1')).toBe('reloaded');
		expect(h.reloads).toEqual(['people']);
	});

	it('leaves an unchanged list alone', async () => {
		const h = harness(async () => 'stamp-1');
		expect(await refreshPeopleIfChanged(h.deps, 'stamp-1')).toBe('fresh');
		expect(h.reloads).toEqual([]);
	});

	it('keeps what it has when Stella cannot be asked, as when offline', async () => {
		const h = harness(async () => {
			throw new TypeError('Failed to fetch');
		});
		expect(await refreshPeopleIfChanged(h.deps, 'stamp-1')).toBe('unknown');
		expect(h.reloads).toEqual([]);
	});
});

/*
 * A form submit or an invalidation reloads the shell's own data in the same navigation; asking
 * for the stamp afterwards only confirms what was just read. The list's identity says which
 * happened: a reloaded shell is handed a new list, a kept one the very same.
 */
describe('shellReloads', () => {
	it('says a navigation that kept the shell needs the check', () => {
		const list = [{ id: 'anna' }];
		const seen = shellReloads(list);
		expect(seen.reloadedSinceLastLook(list)).toBe(false);
		expect(seen.reloadedSinceLastLook(list)).toBe(false);
	});

	it('says a navigation that reloaded the shell does not, once', () => {
		const seen = shellReloads([{ id: 'anna' }]);
		const reloaded = [{ id: 'anna' }];
		expect(seen.reloadedSinceLastLook(reloaded)).toBe(true);
		// The next navigation keeps this list again, and is checked.
		expect(seen.reloadedSinceLastLook(reloaded)).toBe(false);
	});
});
