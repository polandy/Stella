/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

/*
 * The offline shell (docs/02 §2.18).
 *
 * A thin adapter: every question of *what* may be kept is answered by the pure
 * `$lib/pwa/cache-policy`, which is unit-tested; this file only asks those questions of real
 * requests and does what it is told. Nothing that decides anything belongs here, because a
 * service worker can only be observed by driving a browser.
 *
 * Shape: the build's own assets are precached and served cache-first (they are immutable and
 * versioned). Everything else worth keeping is network-first — Stella is on the household's
 * own network, so the network is usually both available and authoritative — falling back to
 * the copy on the device, and finally to the offline page.
 */

import { build, files, version } from '$service-worker';
import {
	OFFLINE_FALLBACK_PATH,
	cacheNameFor,
	endsTheSession,
	isStellaCache,
	verdictFor
} from '$lib/pwa/cache-policy';

const worker = self as unknown as ServiceWorkerGlobalScope;
const CACHE = cacheNameFor(version);

/** The build's own output plus `static/` — immutable, and enough to paint a shell. */
const PRECACHED = [...build, ...files];

/** Everything precached, as a set, so a lookup does not scan the list on every fetch. */
const PRECACHED_PATHS = new Set(PRECACHED);

worker.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			await cache.addAll(PRECACHED);
			// The fallback is fetched now, while there is a connection — it is the one page
			// that is useless unless it was cached before it was needed.
			await cache.add(OFFLINE_FALLBACK_PATH);
			await worker.skipWaiting();
		})()
	);
});

worker.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			// A new build starts from an empty cache rather than mixing its shell with pages the
			// previous one rendered.
			const stale = (await caches.keys()).filter((name) => isStellaCache(name) && name !== CACHE);
			await Promise.all(stale.map((name) => caches.delete(name)));
			await worker.clients.claim();
		})()
	);
});

/** Throw away every page this device is holding. */
async function purgeCaches(): Promise<void> {
	const ours = (await caches.keys()).filter(isStellaCache);
	await Promise.all(ours.map((name) => caches.delete(name)));
}

/** Serve from the network, keeping a copy; fall back to the copy when the network is gone. */
async function networkFirst(request: Request): Promise<Response> {
	const cache = await caches.open(CACHE);
	try {
		const response = await fetch(request);
		// Only a plain success is worth keeping: a redirect to the sign-in page is about this
		// moment, and an error page cached now would outlive the error.
		if (response.ok && response.type === 'basic') cache.put(request, response.clone());
		return response;
	} catch (networkError) {
		const cached = await cache.match(request);
		if (cached) return cached;

		const fallback = await cache.match(OFFLINE_FALLBACK_PATH);
		if (fallback && request.mode === 'navigate') return fallback;
		throw networkError;
	}
}

worker.addEventListener('fetch', (event) => {
	const { request } = event;
	const describe = {
		method: request.method,
		url: request.url,
		origin: worker.location.origin,
		isNavigation: request.mode === 'navigate'
	};

	if (endsTheSession(describe)) {
		// Sign-out empties the device. The purge is awaited alongside the request rather than
		// after it, so the pages are gone even if the browser is closed on the way back.
		event.waitUntil(purgeCaches());
		return;
	}

	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin === worker.location.origin && PRECACHED_PATHS.has(url.pathname)) {
		event.respondWith(
			caches.open(CACHE).then(async (cache) => (await cache.match(url.pathname)) ?? fetch(request))
		);
		return;
	}

	if (verdictFor(describe) === 'keep') event.respondWith(networkFirst(request));
});
