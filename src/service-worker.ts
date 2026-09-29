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
	KEPT_AHEAD,
	NETWORK_PATIENCE_MS,
	OFFLINE_FALLBACK_PATH,
	cacheKeyFor,
	cacheNameFor,
	endsTheSession,
	isPageData,
	isStellaCache,
	keptAt,
	patienceFor,
	standInFor,
	verdictFor,
	type CacheableRequest
} from '$lib/pwa/cache-policy';
import {
	ASK_REACHABILITY,
	REPORT_REACHABILITY,
	type ReachabilityReport
} from '$lib/pwa/reachability';

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
			// The pages already open were asked for by the previous worker, into a cache now gone.
			await keepAhead();
		})()
	);
});

/*
 * Whether the last request actually reached Stella. The worker is the only party that knows:
 * `navigator.onLine` in the page answers "is this device on a network", and a phone on mobile
 * data is online while the household's Stella is entirely out of reach.
 */
let reachable = true;

/*
 * When the page each open window shows was kept, if it came off the device: the offline line
 * says how old it is (docs/concepts/offline-reading.md §4.4). Null once Stella answered it.
 * Keyed by client id, because two windows can show copies of different ages.
 */
const keptAtByClient = new Map<string, number | null>();

/** What to tell the window `clientId` about where things stand. */
function reportFor(clientId: string): ReachabilityReport {
	return { type: REPORT_REACHABILITY, reachable, keptAt: keptAtByClient.get(clientId) ?? null };
}

/** Tell every open page where things stand, so the offline banner matches reality. */
async function report(): Promise<void> {
	const clients = await worker.clients.matchAll({ type: 'window' });
	const open = new Set(clients.map((client) => client.id));
	// Forget the windows that have closed; the map is only ever as long as the open ones.
	for (const id of keptAtByClient.keys()) if (!open.has(id)) keptAtByClient.delete(id);
	for (const client of clients) client.postMessage(reportFor(client.id));
}

/**
 * Record where the page answering `event` came from. A whole page is shown by the window it
 * creates, which asks once it has loaded; a page's data is shown by a window already open, so
 * that one is told now.
 */
function noteServed(event: FetchEvent, kept: Response | null): void {
	// A photo is part of the page, not the page: its age is not what the line reports.
	const isPage = event.request.mode === 'navigate' || isPageData(describe(event.request));
	if (!isPage) return;
	const stamp = kept ? keptAt(kept.headers.get('date')) : null;
	const clientId = event.request.mode === 'navigate' ? event.resultingClientId : event.clientId;
	if (!clientId) return;
	keptAtByClient.set(clientId, stamp);
	if (event.request.mode === 'navigate') return;
	void worker.clients.get(clientId).then((client) => client?.postMessage(reportFor(clientId)));
}

/** Record what a request turned out to prove, and tell the pages only when it changed. */
function noteReachability(nowReachable: boolean): void {
	if (nowReachable === reachable) return;
	reachable = nowReachable;
	void report();
}

worker.addEventListener('message', (event) => {
	// A page that has just opened asks rather than waiting to be told: the report it needs was
	// very likely sent while it was still loading, and there is nothing to poll.
	if (event.data === ASK_REACHABILITY) {
		const source = event.source;
		if (source && 'id' in source) source.postMessage(reportFor(source.id));
		// A page opening is also the moment to keep what should be there before it is read.
		event.waitUntil(keepAhead());
	}
});

/** Fetch and keep each `KEPT_AHEAD` page this build's cache does not hold yet. */
async function keepAhead(): Promise<void> {
	const cache = await caches.open(CACHE);
	for (const path of KEPT_AHEAD) {
		if (await cache.match(path)) continue;
		// Bounded: `activate` waits for this, and every request waits for `activate`.
		const signal = AbortSignal.timeout(NETWORK_PATIENCE_MS);
		const response = await fetch(path, { signal }).catch(() => null);
		// Redirected means signed out: that is the sign-in page, not the one asked for.
		if (response?.ok && response.type === 'basic' && !response.redirected) {
			await cache.put(path, response);
		}
	}
}

/** Throw away every page this device is holding. */
async function purgeCaches(): Promise<void> {
	const ours = (await caches.keys()).filter(isStellaCache);
	await Promise.all(ours.map((name) => caches.delete(name)));
}

/** Resolves with null once `ms` have passed. */
function silence(ms: number): Promise<null> {
	return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}

/**
 * Ask the network, and give it as long as `patienceFor` says: the response, or null when it
 * failed or said nothing in time. A response that lands after that still reaches `onAnswer`,
 * so a late page refreshes the copy and says Stella is back.
 */
async function networkWithin(
	request: Request,
	hasCopy: boolean,
	onAnswer: (response: Response) => void = () => {}
): Promise<Response | null> {
	const network = fetch(request).then((response) => {
		noteReachability(true);
		onAnswer(response);
		return response;
	});
	const answer = await Promise.race([network, silence(patienceFor({ reachable, hasCopy }))]).catch(() => null);
	if (!answer) {
		// Silence or failure alike: the network is not answering, whatever the device believes.
		network.catch(() => {});
		noteReachability(false);
	}
	return answer;
}

/**
 * Serve from the network, keeping a copy under `key`; fall back to the copy when the network
 * does not answer.
 */
async function networkFirst(event: FetchEvent, key: string): Promise<Response> {
	const { request } = event;
	const cache = await caches.open(CACHE);
	const cached = await cache.match(key);
	const response = await networkWithin(request, cached !== undefined, (answer) => {
		// Only a plain success is worth keeping: a redirect to the sign-in page is about this
		// moment, and an error page cached now would outlive the error.
		if (answer.ok && answer.type === 'basic') void cache.put(key, answer.clone());
	});
	if (response) {
		noteServed(event, null);
		return response;
	}
	if (cached) {
		noteServed(event, cached);
		return cached;
	}

	noteServed(event, null);
	const fallback = await cache.match(OFFLINE_FALLBACK_PATH);
	if (fallback && request.mode === 'navigate') return fallback;
	// A page's data failing is what sends SvelteKit to the whole page, which lands above.
	return Response.error();
}

/** A request as the cache policy asks about it. */
function describe(request: Request): CacheableRequest {
	return {
		method: request.method,
		url: request.url,
		origin: worker.location.origin,
		isNavigation: request.mode === 'navigate'
	};
}

worker.addEventListener('fetch', (event) => {
	const { request } = event;
	const described = describe(request);

	if (endsTheSession(described)) {
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
		event.respondWith(networkWithin(request, false).then((response) => response ?? Response.error()));
	}
});

/**
 * A page that is never kept, answered by the network — or, when that does not answer, by the
 * kept page it asks something of (`standInFor`). Nothing is written to the cache here.
 */
async function networkOrStandIn(event: FetchEvent, standIn: string): Promise<Response> {
	const cache = await caches.open(CACHE);
	const kept = await cache.match(standIn);
	const response = await networkWithin(event.request, kept !== undefined);
	noteServed(event, response ? null : (kept ?? null));
	if (response) return response;
	return kept ?? (await cache.match(OFFLINE_FALLBACK_PATH)) ?? Response.error();
}
