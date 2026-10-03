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
			return [
				{ id: 'c1', displayName: 'Hans', description: null, avatarPhotoId: null, formerName: null, jobTitle: null, company: null },
				{ id: 'c2', displayName: 'Franziska Abab', description: null, avatarPhotoId: null, formerName: 'Widmer', jobTitle: null, company: null },
				{ id: 'c3', displayName: 'Anna Meier', description: null, avatarPhotoId: null, formerName: null, jobTitle: 'Laborantin', company: 'Roche' }
			];
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

	it('says who was found by their former name rather than the name they are shown by', async () => {
		const f = fakeRepo();
		const results = await search({ search: f.repo }, viewer, 'widmer');
		expect(results.contacts.map((c) => [c.id, c.formerly])).toEqual([
			['c1', null],
			['c2', 'Widmer'],
			['c3', null]
		]);
	});

	it('says who was found by their job rather than by a name or the description', async () => {
		const f = fakeRepo();
		const byCompany = await search({ search: f.repo }, viewer, 'roche');
		const byName = await search({ search: f.repo }, viewer, 'anna');
		expect(byCompany.contacts.map((c) => [c.id, c.foundByJob])).toEqual([
			['c1', false],
			['c2', false],
			['c3', true]
		]);
		expect(byName.contacts.find((c) => c.id === 'c3')?.foundByJob).toBe(false);
	});
});
