/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

/*
 * What every part of the worker shares: the global scope, the two caches of this build, and
 * the small helpers each of them asks a request through.
 */

import { version } from '$service-worker';
import {
	NETWORK_PATIENCE_MS,
	pagesCacheNameFor,
	shellCacheNameFor,
	type CacheableRequest
} from '$lib/pwa/cache-policy';

export const worker = self as unknown as ServiceWorkerGlobalScope;
/** The build's assets and the offline page: nobody's data, so sign-out leaves it. */
export const SHELL = shellCacheNameFor(version);
/** What a member read: household data, gone at sign-out. */
export const PAGES = pagesCacheNameFor(version);

/** A request as the cache policy asks about it. */
export function describe(request: Request): CacheableRequest {
	return {
		method: request.method,
		url: request.url,
		origin: worker.location.origin,
		isNavigation: request.mode === 'navigate'
	};
}

/** A GET the worker makes on its own behalf, bounded like every request it waits on. */
export function fetchAhead(path: string, headers: HeadersInit = {}): Promise<Response | null> {
	const signal = AbortSignal.timeout(NETWORK_PATIENCE_MS);
	return fetch(path, { headers, signal, cache: 'no-store' }).catch(() => null);
}

/** Whether `response` is Stella's own answer, not the sign-in page a lapsed session gets. */
export const isOwnAnswer = (response: Response | null): response is Response =>
	response !== null && response.type === 'basic' && !response.redirected;
