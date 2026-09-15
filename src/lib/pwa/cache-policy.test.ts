import { describe, expect, it } from 'bun:test';
import { OFFLINE_FALLBACK_PATH, cacheNameFor, isStellaCache, verdictFor } from './cache-policy';

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
