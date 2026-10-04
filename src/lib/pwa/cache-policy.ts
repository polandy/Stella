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
	'/settings/export',
	// Faces from Immich: Immich owns them and may rename, merge or delete the person, and the
	// device keeps no copy of anything from Immich (docs/concepts/immich.md §4.5).
	'/media/immich'
];

/**
 * Pages the service worker keeps as soon as a page opens in reach, rather than once they are
 * read: the places a phone starts from (docs/concepts/offline-reading.md §4.1). Every update
 * starts from an empty cache, so without these the app is empty on the train the morning after
 * one — and Settings is opened rarely and wanted offline all the same.
 */
export const KEPT_AHEAD: readonly string[] = ['/', '/contacts', '/circles', '/settings'];

/**
 * When a kept copy was fetched, from its response's `Date` header: the moment Stella wrote it,
 * so the offline line can say how old the page on screen is. Null when the header is missing
 * or unreadable — the line then says only that the page is from the device, never a made-up age.
 */
export function keptAt(dateHeader: string | null): number | null {
	if (!dateHeader) return null;
	const time = Date.parse(dateHeader);
	return Number.isNaN(time) ? null : time;
}

/** The queries a photo's smaller sizes are asked for with (`thumbnailUrl`, `viewUrl`). */
const PHOTO_SIZE_QUERIES: readonly string[] = ['?thumb', '?view'];

/** Whether `path` is one of `NEVER_CACHED`, or something beneath it. */
function isVolatile(path: string): boolean {
	return NEVER_CACHED.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/*
 * Following a link inside the app fetches only the page's data, from `<page>/__data.json`,
 * never the page itself — so unless that is kept too, a page reached by tapping is never
 * readable offline. SvelteKit adds a mask saying which layouts and the page to reload; the
 * digits change with where the reader came from, so they are no part of what is kept.
 */
const DATA_SUFFIX = '/__data.json';
const INVALIDATED_PARAM = 'x-sveltekit-invalidated';
const TRAILING_SLASH_PARAM = 'x-sveltekit-trailing-slash';

/** The page `url` fetches the data of, or null when it is not a page's data. */
function dataPageOf(url: URL): string | null {
	if (!url.pathname.endsWith(DATA_SUFFIX)) return null;
	return url.pathname.slice(0, -DATA_SUFFIX.length) || '/';
}

/** Whether a page's data response holds the page itself, not only the layouts around it. */
function reloadsThePage(url: URL): boolean {
	return (url.searchParams.get(INVALIDATED_PARAM) ?? '').endsWith('1');
}

/** The question a page's data asks, without SvelteKit's own bookkeeping. */
function questionOf(url: URL): string {
	const search = new URLSearchParams(url.search);
	search.delete(INVALIDATED_PARAM);
	search.delete(TRAILING_SLASH_PARAM);
	return search.toString();
}

/**
 * How long the network gets to answer before the device's copy is used instead. A phone that
 * has lost its network does not always say so — the request goes out and nothing comes back —
 * so without a limit the copy would never be reached. Stella on the household's own network
 * answers far sooner; a response that is merely late still refreshes the copy when it lands.
 */
export const NETWORK_PATIENCE_MS = 4000;

/**
 * How long to wait for the network. Once the last request did not reach Stella, a tap with a
 * copy to show is answered from the device at once, while the network is still asked in the
 * background — its answer is what says Stella is back. Without a copy the network is the only
 * answer there is, so it gets the full wait.
 */
export function patienceFor(state: { reachable: boolean; hasCopy: boolean }): number {
	return state.hasCopy && !state.reachable ? 0 : NETWORK_PATIENCE_MS;
}

/**
 * Whether `request` is a page's data, kept or not. Those are what a tap inside the app waits
 * on, so none of them may wait on silence: failing is what makes SvelteKit fall back to a
 * whole page, which the worker can answer from the device.
 */
export function isPageData(request: CacheableRequest): boolean {
	if (request.method !== 'GET') return false;
	const url = new URL(request.url);
	return url.origin === request.origin && dataPageOf(url) !== null;
}

/** What the service worker may do with the response to `request`. */
export function verdictFor(request: CacheableRequest): CacheVerdict {
	if (request.method !== 'GET') return 'skip';

	const url = new URL(request.url);
	// Another origin's response is not ours to hold, and its size is not ours to spend.
	if (url.origin !== request.origin) return 'skip';

	const dataPage = dataPageOf(url);
	if (dataPage !== null) {
		if (isVolatile(dataPage) || questionOf(url) !== '') return 'skip';
		// Kept under the page alone, so a copy without the page in it would stand in for one.
		return reloadsThePage(url) ? 'keep' : 'skip';
	}

	if (isVolatile(url.pathname)) return 'skip';

	// Pages and the media they are made of; a query string means a search or a filter, which
	// is a question rather than a page somebody returns to. `?thumb` and `?view` are not: they
	// name the sizes every avatar and a group photo's lightbox are drawn at.
	const isMedia = url.pathname.startsWith('/media/');
	const isReReadable = request.isNavigation || isMedia;
	if (!isReReadable) return 'skip';
	const isPhotoSize = isMedia && PHOTO_SIZE_QUERIES.includes(url.search);
	if (url.search !== '' && url.pathname !== OFFLINE_FALLBACK_PATH && !isPhotoSize) return 'skip';

	return 'keep';
}

/**
 * The address a kept response is stored and looked up under: a page's data under the page
 * alone (see `DATA_SUFFIX`), everything else under its own.
 */
export function cacheKeyFor(request: CacheableRequest): string {
	const url = new URL(request.url);
	if (dataPageOf(url) === null) return request.url;
	return `${url.origin}${url.pathname}`;
}

/**
 * The kept page that may stand in for `request` when the network is gone and the page itself
 * was never kept, or null. A question in the URL (`/?compose`, `?relate=…`) is not kept, but
 * it asks something *of* a page that is: offline, that page is a far better answer than the
 * browser's error screen, and the app on it can still read the question from the address.
 */
export function standInFor(request: CacheableRequest): string | null {
	if (request.method !== 'GET' || !request.isNavigation) return null;

	const url = new URL(request.url);
	if (url.origin !== request.origin || url.search === '' || isVolatile(url.pathname)) return null;
	return url.pathname;
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
