import { describe, expect, it } from 'bun:test';
import {
	isImmichId,
	readAssetPage,
	readOwner,
	readPeoplePage,
	readPerson,
	readPersonList,
	readStatistics,
	readVersion
} from './gateway';

const ANNA = '6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b';
const BERT = '7a2b3c4d-5e6f-4a1b-9c2d-3e4f5a6b7c8d';

describe('isImmichId', () => {
	it('accepts the UUIDs Immich gives its people', () => {
		expect(isImmichId(ANNA)).toBe(true);
		expect(isImmichId(ANNA.toUpperCase())).toBe(true);
	});

	it('refuses anything that could change the path it is put into', () => {
		for (const raw of ['', '..', '../users/me', `${ANNA}/thumbnail`, `${ANNA}?x=1`, 'anna', 42, null]) {
			expect(isImmichId(raw)).toBe(false);
		}
	});
});

describe('readVersion', () => {
	it('reads the three numbers of the server version', () => {
		expect(readVersion({ major: 3, minor: 2, patch: 4 })).toEqual({ major: 3, minor: 2, patch: 4 });
	});

	it('refuses a body that is not one', () => {
		for (const payload of [null, 'v3.2.4', { major: 3, minor: 2 }, { major: '3', minor: 2, patch: 4 }, { major: -1, minor: 0, patch: 0 }]) {
			expect(readVersion(payload)).toBeNull();
		}
	});
});

describe('readOwner', () => {
	it('reads who the key belongs to', () => {
		expect(readOwner({ id: 'u1', name: 'Anna', email: 'anna@example.test', isAdmin: true })).toEqual({
			name: 'Anna',
			email: 'anna@example.test'
		});
	});

	it('refuses an owner without an email, since that is how the owner is recognised', () => {
		expect(readOwner({ name: 'Anna' })).toBeNull();
		expect(readOwner({ name: 'Anna', email: '' })).toBeNull();
		expect(readOwner(null)).toBeNull();
	});

	it('keeps an owner who never gave a name', () => {
		expect(readOwner({ email: 'anna@example.test' })).toEqual({ name: '', email: 'anna@example.test' });
	});
});

describe('readPerson', () => {
	it('reads a person, their name trimmed', () => {
		expect(readPerson({ id: ANNA, name: ' Anna Example ', isHidden: false, thumbnailPath: '/x' })).toEqual({
			id: ANNA,
			name: 'Anna Example',
			hidden: false
		});
	});

	it('reads a person without the hidden flag as shown', () => {
		expect(readPerson({ id: ANNA, name: 'Anna' })?.hidden).toBe(false);
	});

	it('refuses a person whose id is not an Immich id', () => {
		expect(readPerson({ id: '../users/me', name: 'Anna' })).toBeNull();
		expect(readPerson({ name: 'Anna' })).toBeNull();
	});
});

describe('readPersonList and readPeoplePage', () => {
	const people = [
		{ id: ANNA, name: 'Anna', isHidden: false },
		{ id: 'nope', name: 'Broken' },
		{ id: BERT, name: 'Bert', isHidden: true }
	];

	it('keeps the readable people of a search and drops the rest', () => {
		expect(readPersonList(people)).toEqual([
			{ id: ANNA, name: 'Anna', hidden: false },
			{ id: BERT, name: 'Bert', hidden: true }
		]);
		expect(readPersonList({ people })).toBeNull();
	});

	it('reads a page of the people listing', () => {
		expect(readPeoplePage({ people, total: 3, hidden: 1, hasNextPage: true })).toEqual({
			people: [
				{ id: ANNA, name: 'Anna', hidden: false },
				{ id: BERT, name: 'Bert', hidden: true }
			],
			hasNextPage: true
		});
		expect(readPeoplePage({ people: [] })).toEqual({ people: [], hasNextPage: false });
		expect(readPeoplePage([])).toBeNull();
	});
});

describe('readStatistics', () => {
	it('reads how many photos a person is in', () => {
		expect(readStatistics({ assets: 1284 })).toEqual({ assets: 1284 });
	});

	it('refuses a count that is not one', () => {
		for (const payload of [null, {}, { assets: '12' }, { assets: -1 }, { assets: 1.5 }]) {
			expect(readStatistics(payload)).toBeNull();
		}
	});
});

describe('readAssetPage', () => {
	const asset = (id: string, extra: Record<string, unknown> = {}) => ({
		id,
		type: 'IMAGE',
		visibility: 'timeline',
		isTrashed: false,
		localDateTime: '2026-08-14T18:30:00.000Z',
		fileCreatedAt: '2026-08-14T16:30:00.000Z',
		...extra
	});

	it('reads the photos of a search page, with the day they were taken where they were taken', () => {
		expect(readAssetPage({ assets: { items: [asset(ANNA), asset(BERT)], nextCursor: 'next-1' } })).toEqual({
			assets: [
				{ id: ANNA, takenOn: '2026-08-14' },
				{ id: BERT, takenOn: '2026-08-14' }
			],
			nextCursor: 'next-1'
		});
	});

	it('falls back to the file date, and to no date at all', () => {
		const page = readAssetPage({
			assets: {
				items: [asset(ANNA, { localDateTime: null }), asset(BERT, { localDateTime: 'x', fileCreatedAt: 'y' })],
				nextCursor: null
			}
		});
		expect(page?.assets).toEqual([
			{ id: ANNA, takenOn: '2026-08-14' },
			{ id: BERT, takenOn: null }
		]);
		expect(page?.nextCursor).toBeNull();
	});

	it('never passes on what Immich hides: archived, locked, hidden or trashed photos, nor videos', () => {
		const page = readAssetPage({
			assets: {
				items: [
					asset(ANNA, { visibility: 'archive' }),
					asset(ANNA, { visibility: 'locked' }),
					asset(ANNA, { visibility: 'hidden' }),
					asset(ANNA, { isTrashed: true }),
					asset(ANNA, { type: 'VIDEO' }),
					asset('../x'),
					'nonsense',
					asset(BERT)
				],
				nextCursor: ''
			}
		});
		expect(page).toEqual({ assets: [{ id: BERT, takenOn: '2026-08-14' }], nextCursor: null });
	});

	it('refuses a body that is not a search page', () => {
		for (const payload of [null, [], {}, { assets: [] }, { assets: { items: {} } }]) {
			expect(readAssetPage(payload)).toBeNull();
		}
	});
});
