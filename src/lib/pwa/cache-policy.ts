/*
 * What a device may keep (docs/02 §2.18).
 *
 * This is the whole of the offline story's judgement, kept pure and away from the service
 * worker so it can be read and tested without a browser. `service-worker.ts` is the adapter
 * that asks these questions of a real `Request` and does what it is told.
 *
 * The rule behind the rules: a cached page is household data sitting on a device, so only
 * what someone would plausibly want to re-read offline is kept, nothing that describes the
 * session or a moment in time, and the lot is thrown away on sign-out.
 */

/** Everything the policy needs to know about a request. */
export interface CacheableRequest {
	method: string;
	/** The absolute request URL. */
	url: string;
	/** The origin Stella is served from. */
	origin: string;
	/** Whether the browser is fetching a whole page rather than something inside one. */
	isNavigation: boolean;
}

/** Whether a response may be written to, and later served from, the cache. */
export type CacheVerdict = 'keep' | 'skip';

/** The page shown when a request cannot be answered from the network or the cache. */
export const OFFLINE_FALLBACK_PATH = '/offline';

/** Prefix every cache Stella owns shares, so `purgeCaches` can recognise its own. */
const CACHE_PREFIX = 'stella-';

/**
 * Paths whose answer is only ever true at the instant it is given: the session routes, the
 * health probe, the language switch, and the manifest (which is itself language-dependent).
 * Serving any of these from a cache would state something that has since stopped being so.
 */
const NEVER_CACHED = [
	'/login',
	'/logout',
	'/setup',
	'/healthz',
	'/locale',
	'/manifest.webmanifest',
	// The import and export screens report on a run: replayed from a cache they would
	// describe work that is not happening.
	'/settings/import',
	'/settings/export'
];

/** Whether `path` is one of `NEVER_CACHED`, or something beneath it. */
function isVolatile(path: string): boolean {
	return NEVER_CACHED.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** What the service worker may do with the response to `request`. */
export function verdictFor(request: CacheableRequest): CacheVerdict {
	if (request.method !== 'GET') return 'skip';

	const url = new URL(request.url);
	// Another origin's response is not ours to hold, and its size is not ours to spend.
	if (url.origin !== request.origin) return 'skip';
	if (isVolatile(url.pathname)) return 'skip';

	// Pages and the media they are made of; a query string means a search or a filter, which
	// is a question rather than a page somebody returns to.
	const isReReadable = request.isNavigation || url.pathname.startsWith('/media/');
	if (!isReReadable) return 'skip';
	if (url.search !== '' && url.pathname !== OFFLINE_FALLBACK_PATH) return 'skip';

	return 'keep';
}

/** The route that ends a session. A POST to it is the last thing a signed-in device does. */
const SIGN_OUT_PATH = '/logout';

/**
 * Whether this request is somebody signing out.
 *
 * The sign-out button is a plain form post with no client-side step to hang a purge on, so
 * the request passing through the worker is the only signal there is that the pages on this
 * device have stopped being the reader's to see.
 */
export function endsTheSession(request: CacheableRequest): boolean {
	if (request.method !== 'POST') return false;

	const url = new URL(request.url);
	return url.origin === request.origin && url.pathname === SIGN_OUT_PATH;
}

/**
 * The cache holding one build's pages. Named after the app version so a deployed update
 * starts from an empty one rather than mixing new shell with pages the old one rendered.
 */
export function cacheNameFor(version: string): string {
	return `${CACHE_PREFIX}${version}`;
}

/** Whether a name from `caches.keys()` belongs to Stella. */
export function isStellaCache(name: string): boolean {
	return name.startsWith(CACHE_PREFIX);
}
