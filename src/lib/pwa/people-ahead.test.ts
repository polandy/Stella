import { describe, expect, it } from 'bun:test';
import {
	REFRESH_INTERVAL_MS,
	isNewerCopy,
	keysToPrune,
	parseVisiblePeople,
	peopleToKeep,
	refreshDue
} from './people-ahead';

/*
 * Every person the member can see, readable out of reach (docs/concepts/offline-reading.md §4):
 * which pages are kept ahead, which kept pages must go, and when to look again.
 */

const ORIGIN = 'https://stella.example';

describe('peopleToKeep', () => {
	it('keeps the person page and the journal of everyone, each as its page data', () => {
		expect(peopleToKeep([{ id: 'c1', avatarPhotoId: null }])).toEqual({
			pages: [
				'/contacts/c1/__data.json?x-sveltekit-invalidated=001',
				'/contacts/c1/journal/__data.json?x-sveltekit-invalidated=001'
			],
			avatars: []
		});
	});

	it('keeps each avatar as the thumbnail the pages draw', () => {
		expect(peopleToKeep([{ id: 'c1', avatarPhotoId: 'p1' }]).avatars).toEqual(['/media/p1?thumb']);
	});
});

describe('keysToPrune', () => {
	const kept = [
		`${ORIGIN}/contacts/gone`,
		`${ORIGIN}/contacts/gone/__data.json`,
		`${ORIGIN}/contacts/gone/journal/__data.json`,
		`${ORIGIN}/contacts/stays`,
		`${ORIGIN}/contacts/stays/__data.json`,
		`${ORIGIN}/contacts`,
		`${ORIGIN}/contacts/__data.json`,
		`${ORIGIN}/contacts/new`,
		`${ORIGIN}/contacts/new/__data.json`,
		`${ORIGIN}/`,
		`${ORIGIN}/media/p1?thumb`
	];

	it('drops every kept page of a person who is no longer visible, in every form it was kept', () => {
		expect(keysToPrune(kept, ORIGIN, new Set(['stays']))).toEqual([
			`${ORIGIN}/contacts/gone`,
			`${ORIGIN}/contacts/gone/__data.json`,
			`${ORIGIN}/contacts/gone/journal/__data.json`
		]);
	});

	it('keeps the pages of people still visible, and every page that is not a person’s', () => {
		const pruned = keysToPrune(kept, ORIGIN, new Set(['stays']));
		expect(pruned).not.toContain(`${ORIGIN}/contacts/stays`);
		expect(pruned).not.toContain(`${ORIGIN}/contacts/new`);
		expect(pruned).not.toContain(`${ORIGIN}/contacts`);
		// The People list's own data, which a tap on People reads offline.
		expect(pruned).not.toContain(`${ORIGIN}/contacts/__data.json`);
		expect(pruned).not.toContain(`${ORIGIN}/contacts/new/__data.json`);
	});

	it('leaves another origin’s keys alone', () => {
		expect(keysToPrune(['https://elsewhere.example/contacts/gone'], ORIGIN, new Set())).toEqual([]);
	});
});

describe('isNewerCopy', () => {
	it('lets a fresher answer replace the copy, and never an older one that landed late', () => {
		const monday = 'Mon, 28 Sep 2026 16:04:00 GMT';
		const tuesday = 'Tue, 29 Sep 2026 08:00:00 GMT';
		expect(isNewerCopy(tuesday, monday)).toBe(true);
		expect(isNewerCopy(monday, monday)).toBe(true);
		expect(isNewerCopy(monday, tuesday)).toBe(false);
	});

	it('takes the answer when either date is unknown, rather than keep a copy forever', () => {
		expect(isNewerCopy(null, 'Mon, 28 Sep 2026 16:04:00 GMT')).toBe(true);
		expect(isNewerCopy('Mon, 28 Sep 2026 16:04:00 GMT', null)).toBe(true);
	});
});

describe('refreshDue', () => {
	it('is due on the first run, and again once the interval has passed', () => {
		expect(refreshDue(null, 1_000)).toBe(true);
		expect(refreshDue(0, REFRESH_INTERVAL_MS)).toBe(true);
	});

	it('is not due while the last run is recent, so opening a few pages does not repeat it', () => {
		expect(refreshDue(0, REFRESH_INTERVAL_MS - 1)).toBe(false);
	});
});

describe('parseVisiblePeople', () => {
	it('reads the list the server sends', () => {
		expect(parseVisiblePeople({ people: [{ id: 'c1', avatarPhotoId: null }] })).toEqual([
			{ id: 'c1', avatarPhotoId: null }
		]);
	});

	it('refuses anything else, so a broken answer never prunes the device empty', () => {
		expect(parseVisiblePeople(null)).toBeNull();
		expect(parseVisiblePeople({})).toBeNull();
		expect(parseVisiblePeople({ people: [{ id: 3 }] })).toBeNull();
		expect(parseVisiblePeople('<html>sign in</html>')).toBeNull();
	});
});
