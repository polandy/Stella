import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import { search, type SearchRepository } from './search';

/*
 * The search use-case turns input into an FTS query and delegates to the port. A blank
 * query must not hit the index at all (docs/02 §2.9).
 */

const viewer: Viewer = { id: 'u', householdId: 'h' };

function fakeRepo() {
	const calls: string[] = [];
	const repo: SearchRepository = {
		searchContacts: async (_v, q) => {
			calls.push(`contacts:${q}`);
			return [{ id: 'c1', displayName: 'Hans', description: null }];
		},
		searchNotes: async (_v, q) => {
			calls.push(`notes:${q}`);
			return [];
		}
	};
	return { repo, calls };
}

describe('search', () => {
	it('returns empty results without touching the index for a blank query', async () => {
		const f = fakeRepo();
		const results = await search({ search: f.repo }, viewer, '   ');
		expect(results).toEqual({ contacts: [], notes: [] });
		expect(f.calls).toEqual([]);
	});

	it('queries both contacts and notes with the derived FTS query', async () => {
		const f = fakeRepo();
		const results = await search({ search: f.repo }, viewer, 'Hans');
		expect(f.calls).toEqual(['contacts:hans*', 'notes:hans*']);
		expect(results.contacts[0]?.displayName).toBe('Hans');
	});
});
