import { describe, expect, it } from 'bun:test';
import {
	KEPT_AHEAD,
	OFFLINE_FALLBACK_PATH,
	NETWORK_PATIENCE_MS,
	cacheKeyFor,
	cacheNameFor,
	isPageData,
	patienceFor,
	endsTheSession,
	isStellaCache,
	keptAt,
	standInFor,
	verdictFor
} from './cache-policy';

const ORIGIN = 'https://stella.example';

/** A GET navigation to `path`, the shape almost every case here is about. */
function page(path: string) {
	return { method: 'GET', url: `${ORIGIN}${path}`, origin: ORIGIN, isNavigation: true };
}

/** A GET for a subresource — an image, a script — rather than a whole page. */
function asset(path: string, origin = ORIGIN) {
	return { method: 'GET', url: `${origin}${path}`, origin: ORIGIN, isNavigation: false };
}

describe('what may be kept on the device', () => {
	it('keeps the pages people actually come back to', () => {
		expect(verdictFor(page('/contacts/abc'))).toBe('keep');
		expect(verdictFor(page('/'))).toBe('keep');
		expect(verdictFor(page('/circles/xyz'))).toBe('keep');
	});

	it('keeps the photos those pages are made of', () => {
		expect(verdictFor(asset('/media/abc'))).toBe('keep');
	});

	it('refuses anything that is not a plain read', () => {
		expect(verdictFor({ ...page('/contacts/abc'), method: 'POST' })).toBe('skip');
	});

	it('refuses another origin, whose responses are not ours to hold', () => {
		expect(verdictFor(asset('/avatar.png', 'https://elsewhere.example'))).toBe('skip');
	});
});

/**
 * The data SvelteKit fetches for `path` when a link inside the app is followed, rather than
 * the whole document. `nodes` is its invalidation mask, one digit per layout and the page.
 */
function pageData(path: string, nodes = '001', query = '') {
	const base = path === '/' ? '' : path;
	const search = new URLSearchParams(query);
	search.append('x-sveltekit-invalidated', nodes);
	return asset(`${base}/__data.json?${search}`);
}

describe('a page opened from inside the app', () => {
	it('is kept too, or only pages loaded from the address bar would ever be readable offline', () => {
		expect(verdictFor(pageData('/settings'))).toBe('keep');
		expect(verdictFor(pageData('/contacts/abc', '01'))).toBe('keep');
		expect(verdictFor(pageData('/'))).toBe('keep');
	});

	it('is kept under the page alone, whichever layouts that visit happened to reload', () => {
		expect(cacheKeyFor(pageData('/settings', '001'))).toBe(cacheKeyFor(pageData('/settings', '111')));
		expect(cacheKeyFor(pageData('/settings'))).not.toBe(cacheKeyFor(pageData('/circles')));
	});

	it('is not kept when the page itself was not reloaded — there is nothing of it to show later', () => {
		expect(verdictFor(pageData('/settings', '110'))).toBe('skip');
	});

	it('follows the same exclusions as the page itself', () => {
		expect(verdictFor(pageData('/settings/import'))).toBe('skip');
		expect(verdictFor(pageData('/search', '01', 'q=ada'))).toBe('skip');
		expect(verdictFor({ ...pageData('/settings'), method: 'POST' })).toBe('skip');
	});

	it('leaves every other request under its own address', () => {
		expect(cacheKeyFor(page('/contacts/abc'))).toBe(`${ORIGIN}/contacts/abc`);
		expect(cacheKeyFor(asset('/media/abc'))).toBe(`${ORIGIN}/media/abc`);
	});
});

describe('how long the network is given', () => {
	it('is long enough for Stella to answer, and short enough that nobody stares at a spinner', () => {
		// A phone that has lost its network does not always say so: the request goes out and
		// nothing ever comes back. Waiting for that would leave the kept copy unused forever.
		expect(patienceFor({ reachable: true, hasCopy: true })).toBe(NETWORK_PATIENCE_MS);
		expect(NETWORK_PATIENCE_MS).toBeGreaterThan(0);
	});

	it('is nothing once Stella has stopped answering, so each tap offline is answered at once', () => {
		expect(patienceFor({ reachable: false, hasCopy: true })).toBe(0);
	});

	it('is the full wait when there is no copy — back home, the network is the only answer', () => {
		expect(patienceFor({ reachable: false, hasCopy: false })).toBe(NETWORK_PATIENCE_MS);
		expect(patienceFor({ reachable: true, hasCopy: false })).toBe(NETWORK_PATIENCE_MS);
	});
});

describe('the data of a page', () => {
	it('is recognised whether or not it may be kept, so it never waits on silence either', () => {
		expect(isPageData(pageData('/settings'))).toBe(true);
		expect(isPageData(pageData('/', '01', 'kind=person'))).toBe(true);
		expect(isPageData(pageData('/settings/import'))).toBe(true);
	});

	it('is not mistaken for a page, a photo or another origin', () => {
		expect(isPageData(page('/settings'))).toBe(false);
		expect(isPageData(asset('/media/abc'))).toBe(false);
		expect(isPageData(asset('/settings/__data.json', 'https://elsewhere.example'))).toBe(false);
		expect(isPageData({ ...pageData('/settings'), method: 'POST' })).toBe(false);
	});
});

describe('what must never be kept', () => {
	it('refuses the pages that exist to change the session', () => {
		expect(verdictFor(page('/login'))).toBe('skip');
		expect(verdictFor(page('/logout'))).toBe('skip');
		expect(verdictFor(page('/setup'))).toBe('skip');
	});

	it('refuses the health check, which is a question about right now', () => {
		expect(verdictFor(asset('/healthz'))).toBe('skip');
	});

	it('refuses a stale answer to "which language am I reading in"', () => {
		expect(verdictFor(asset('/locale'))).toBe('skip');
		expect(verdictFor(asset('/manifest.webmanifest'))).toBe('skip');
	});

	it('refuses a page that answers a question rather than being a place', () => {
		// `/search?q=ada` is a query someone typed, not somewhere they will come back to, and
		// caching one per phrase fills the device with answers nobody asked for twice.
		expect(verdictFor(page('/search?q=ada'))).toBe('skip');
		expect(verdictFor(page('/graph?focus=abc'))).toBe('skip');
	});

	it('refuses a page that only reports how an upload went', () => {
		// The import screens describe a run that has finished; replayed offline they would
		// claim a restore is in progress that nobody started.
		expect(verdictFor(page('/settings/import/archive'))).toBe('skip');
	});
});

describe('what is kept before it is read', () => {
	it('is every place a phone starts from, so a fresh update is not an empty app on the train', () => {
		// docs/concepts/offline-reading.md §4.1: Home, People, Circles and Settings.
		expect([...KEPT_AHEAD].sort()).toEqual(['/', '/circles', '/contacts', '/settings']);
	});

	it('is only ever what would be kept anyway once read', () => {
		for (const path of KEPT_AHEAD) expect(verdictFor(page(path))).toBe('keep');
	});
});

describe('when a kept copy was fetched', () => {
	it('is read off the response’s own date, the moment Stella wrote it', () => {
		expect(keptAt('Mon, 28 Sep 2026 16:04:00 GMT')).toBe(Date.UTC(2026, 8, 28, 16, 4));
	});

	it('is unknown rather than guessed when the date is missing or unreadable', () => {
		expect(keptAt(null)).toBeNull();
		expect(keptAt('')).toBeNull();
		expect(keptAt('yesterday-ish')).toBeNull();
	});
});

describe('the offline page', () => {
	it('is kept, or there is nothing to show when the network is gone', () => {
		expect(verdictFor(page(OFFLINE_FALLBACK_PATH))).toBe('keep');
	});
});

describe('the cache name', () => {
	it('changes with the build, so a new Stella never reads the old one', () => {
		expect(cacheNameFor('1.0.0')).not.toBe(cacheNameFor('1.0.1'));
	});

	it('is recognisable as ours, so the purge can find every one of them', () => {
		expect(isStellaCache(cacheNameFor('1.0.0'))).toBe(true);
		expect(isStellaCache(cacheNameFor('0.0.11'))).toBe(true);
	});

	it('is not so loose that it claims another app’s cache', () => {
		expect(isStellaCache('workbox-precache-v2')).toBe(false);
		expect(isStellaCache('')).toBe(false);
	});
});

describe('signing out', () => {
	it('is recognised, so the device can be emptied as it happens', () => {
		expect(endsTheSession({ ...page('/logout'), method: 'POST' })).toBe(true);
	});

	it('is recognised without JavaScript, which is how the form actually posts', () => {
		// The sign-out button is a plain form post, so there is no client-side hook to hang
		// the purge on — the request passing through the worker is the only signal there is.
		expect(endsTheSession({ ...asset('/logout'), method: 'POST', isNavigation: true })).toBe(
			true
		);
	});

	it('is not confused with merely looking at a page', () => {
		expect(endsTheSession(page('/logout'))).toBe(false);
		expect(endsTheSession({ ...page('/contacts/abc'), method: 'POST' })).toBe(false);
	});

	it('is not claimed for another origin that happens to have the same path', () => {
		expect(
			endsTheSession({ ...asset('/logout', 'https://elsewhere.example'), method: 'POST' })
		).toBe(false);
	});
});

describe('what stands in for a page that was never kept', () => {
	it('offers the same page without its question, so /?compose still opens Home offline', () => {
		expect(standInFor(page('/?compose'))).toBe('/');
		expect(standInFor(page('/contacts/abc?relate=xyz'))).toBe('/contacts/abc');
	});

	it('has nothing to offer for a page without a question, a volatile page or anything else', () => {
		expect(standInFor(page('/contacts/abc'))).toBeNull();
		expect(standInFor(page('/login?next=/'))).toBeNull();
		expect(standInFor(asset('/media/abc?thumb'))).toBeNull();
		expect(standInFor({ ...page('/?compose'), method: 'POST' })).toBeNull();
		expect(standInFor({ ...page('/?compose'), url: 'https://elsewhere.example/?compose' })).toBeNull();
	});
});
