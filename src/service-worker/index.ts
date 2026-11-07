/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

/*
 * The offline shell (docs/02 §2.18).
 *
 * A thin adapter: every question of *what* may be kept is answered by the pure
 * `$lib/pwa/cache-policy`, which is unit-tested; this folder only asks those questions of real
 * requests and does what it is told. Nothing that decides anything belongs here, because a
 * service worker can only be observed by driving a browser.
 *
 * Shape: the build's own assets are precached and served cache-first (they are immutable and
 * versioned). Everything else worth keeping is network-first — Stella is on the household's
 * own network, so the network is usually both available and authoritative — falling back to
 * the copy on the device, and finally to the offline page.
 *
 * This file wires the worker's events; `reachability.ts` tracks whether Stella answers,
 * `people-ahead.ts` keeps pages before they are read, `strategies.ts` answers requests, and
 * `keep.ts` is the one write to the pages cache.
 */

import { build, files } from '$service-worker';
import {
	OFFLINE_FALLBACK_PATH,
	cacheKeyFor,
	endsTheSession,
	isPageData,
	isShareArrival,
	isStellaCache,
	standInFor,
	verdictFor
} from '$lib/pwa/cache-policy';
import { ASK_REACHABILITY, readCheck } from '$lib/pwa/reachability';
import { keepAhead, refreshPeople } from './people-ahead';
import { checkReachability, reportFor } from './reachability';
import { PAGES, SHELL, describe, worker } from './scope';
import {
	networkFirst,
	networkOrStandIn,
	networkWithin,
	purgeCaches,
	takeShare
} from './strategies';

/** The build's own output plus `static/` — immutable, and enough to paint a shell. */
const PRECACHED = [...build, ...files];

/** Everything precached, as a set, so a lookup does not scan the list on every fetch. */
const PRECACHED_PATHS = new Set(PRECACHED);

worker.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(SHELL);
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
			// A new build starts from empty caches rather than mixing its shell with pages the
			// previous one rendered.
			const stale = (await caches.keys()).filter(
				(name) => isStellaCache(name) && name !== SHELL && name !== PAGES
			);
			await Promise.all(stale.map((name) => caches.delete(name)));
			await worker.clients.claim();
			// The pages already open were asked for by the previous worker, into a cache now gone.
			await keepAhead();
		})()
	);
});

worker.addEventListener('message', (event) => {
	// A page that has just opened asks rather than waiting to be told: the report it needs was
	// very likely sent while it was still loading, and there is nothing to poll.
	if (event.data === ASK_REACHABILITY) {
		const source = event.source;
		if (source && 'id' in source) source.postMessage(reportFor(source.id));
		// A page opening is also the moment to keep what should be there before it is read.
		event.waitUntil(keepAhead().then(refreshPeople));
	}
	const check = readCheck(event.data);
	if (check) event.waitUntil(checkReachability(check.deviceOnline ?? worker.navigator.onLine));
});

worker.addEventListener('fetch', (event) => {
	const { request } = event;
	const described = describe(request);

	if (endsTheSession(described)) {
		// Sign-out empties the device. The purge is awaited alongside the request rather than
		// after it, so the pages are gone even if the browser is closed on the way back.
		event.waitUntil(purgeCaches());
		return;
	}

	if (isShareArrival(described)) {
		event.respondWith(takeShare(request));
		return;
	}

	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin === worker.location.origin && PRECACHED_PATHS.has(url.pathname)) {
		event.respondWith(
			caches.open(SHELL).then(async (cache) => (await cache.match(url.pathname)) ?? fetch(request))
		);
		return;
	}

	if (verdictFor(described) === 'keep') {
		event.respondWith(networkFirst(event, cacheKeyFor(described)));
		return;
	}

	const standIn = standInFor(described);
	if (standIn) {
		event.respondWith(networkOrStandIn(event, standIn));
		return;
	}

	// A page's data that is never kept — a filter, a search — still must not wait on silence.
	if (isPageData(described)) {
		event.respondWith(
			networkWithin(request, false).then((response) => response ?? Response.error())
		);
	}
});
