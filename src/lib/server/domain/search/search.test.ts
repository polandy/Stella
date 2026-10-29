import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import { NOTHING_FOUND, search, type MomentHit, type SearchRepository } from './search';

/*
 * The search use-case turns input into an FTS query and delegates to the port. A blank
 * query must not hit the index at all (docs/02 §2.9).
 */

const viewer: Viewer = { id: 'u', householdId: 'h' };

const moment: MomentHit = {
	entryId: 'j1',
	title: null,
	snippet: 'Up the hill #Hike',
	visibility: 'shared',
	entryDate: '2026-10-12',
	contactId: 'c1',
	contactName: 'Hans'
};

function fakeRepo() {
	const calls: string[] = [];
	const repo: SearchRepository = {
		searchContacts: async (_v, q) => {
			calls.push(`contacts:${q}`);
			return [
				{
					id: 'c1',
					displayName: 'Hans',
					description: null,
					avatarPhotoId: null,
					formerName: null,
					jobTitle: null,
					company: null
				},
				{
					id: 'c2',
					displayName: 'Franziska Abab',
					description: null,
					avatarPhotoId: null,
					formerName: 'Widmer',
					jobTitle: null,
					company: null
				},
				{
					id: 'c3',
					displayName: 'Anna Meier',
					description: null,
					avatarPhotoId: null,
					formerName: null,
					jobTitle: 'Laborantin',
					company: 'Roche'
				}
			];
		},
		searchNotes: async (_v, q) => {
			calls.push(`notes:${q}`);
			return [];
		},
		searchGifts: async (_v, q) => {
			calls.push(`gifts:${q}`);
			return [
				{
					giftId: 'g1',
					title: 'Fotobuch',
					state: 'given',
					givenOn: '2025-12-24',
					contactId: 'c1',
					contactName: 'Hans'
				}
			];
		},
		searchMoments: async (_v, q) => {
			calls.push(`moments:${q}`);
			return [moment];
		},
		searchMomentsByTag: async (_v, key) => {
			calls.push(`tag:${key}`);
			return [moment];
		}
	};
	return { repo, calls };
}

describe('search', () => {
	it('returns empty results without touching the index for a blank query', async () => {
		const f = fakeRepo();
		const results = await search({ search: f.repo }, viewer, '   ');
		expect(results).toEqual(NOTHING_FOUND);
		expect(f.calls).toEqual([]);
	});

	it('queries contacts, notes, gifts and moments with the derived FTS query', async () => {
		const f = fakeRepo();
		const results = await search({ search: f.repo }, viewer, 'Hans');
		expect(f.calls).toEqual(['contacts:hans*', 'notes:hans*', 'gifts:hans*', 'moments:hans*']);
		expect(results.contacts[0]?.displayName).toBe('Hans');
		expect(results.gifts.map((g) => g.giftId)).toEqual(['g1']);
		expect(results.moments.map((m) => m.entryId)).toEqual(['j1']);
		expect(results.tag).toBeNull();
	});

	it('asks for one #tag alone: only the moments carrying it, by its key', async () => {
		const f = fakeRepo();
		const results = await search({ search: f.repo }, viewer, ' #Hike ');
		expect(f.calls).toEqual(['tag:hike']);
		expect(results).toEqual({ ...NOTHING_FOUND, moments: [moment], tag: 'hike' });
	});

	it('reads a #tag among other words as words', async () => {
		const f = fakeRepo();
		await search({ search: f.repo }, viewer, '#hike lake');
		expect(f.calls).toContain('moments:hike* lake*');
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
