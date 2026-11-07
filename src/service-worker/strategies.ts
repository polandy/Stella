/// <reference lib="webworker" />

/*
 * How a request the fetch handler took on is answered: network-first with the device's copy
 * behind it, a stand-in page, a share from another app, the sign-out purge.
 */

import { version } from '$service-worker';
import {
	OFFLINE_FALLBACK_PATH,
	SHARE_PATH,
	isPageData,
	patienceFor,
	purgedAtSignOut
} from '$lib/pwa/cache-policy';
import { keepShare, shareFrom } from '$lib/pwa/share-store';
import { keepCopy } from './keep';
import { isReachable, noteAnswered, noteReachability, noteServed, sendMark } from './reachability';
import { PAGES, SHELL, describe, worker } from './scope';

/** Throw away every page this device is holding; the shell stays (`purgedAtSignOut`). */
export async function purgeCaches(): Promise<void> {
	const purged = purgedAtSignOut(await caches.keys(), version);
	await Promise.all(purged.map((name) => caches.delete(name)));
}

/** The page shown when nothing else can be, kept with the shell since the build was installed. */
async function offlinePage(): Promise<Response | undefined> {
	return (await caches.open(SHELL)).match(OFFLINE_FALLBACK_PATH);
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
export async function networkWithin(
	request: Request,
	hasCopy: boolean,
	onAnswer: (response: Response) => void = () => {}
): Promise<Response | null> {
	const sentAt = sendMark();
	const network = fetch(request).then((response) => {
		noteAnswered(sentAt);
		onAnswer(response);
		return response;
	});
	const patience = patienceFor({ reachable: isReachable(), hasCopy });
	const answer = await Promise.race([network, silence(patience)]).catch(() => null);
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
export async function networkFirst(event: FetchEvent, key: string): Promise<Response> {
	const { request } = event;
	const cache = await caches.open(PAGES);
	const cached = await cache.match(key);
	const pageData = isPageData(describe(request));
	const response = await networkWithin(request, cached !== undefined, (answer) => {
		// Only a plain success is worth keeping: a redirect to the sign-in page is about this
		// moment, and an error page cached now would outlive the error.
		void keepCopy(cache, key, answer.clone(), pageData);
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
	const fallback = await offlinePage();
	if (fallback && request.mode === 'navigate') return fallback;
	// A page's data failing is what sends SvelteKit to the whole page, which lands above.
	return Response.error();
}

/**
 * A share from another app (docs/02 §2.18.3): kept on the device and the sheet opened on it,
 * whether Stella is in reach or not — the sheet saves through the outbox, which waits when it
 * must. A 303, so the sheet is a GET the cache can answer and a reload does not post again.
 */
export async function takeShare(request: Request): Promise<Response> {
	const share = shareFrom(await request.formData(), crypto.randomUUID(), Date.now());
	await keepShare(share);
	const sheet = new URL(SHARE_PATH, worker.location.origin);
	sheet.searchParams.set('pending', share.id);
	return Response.redirect(sheet.href, 303);
}

/**
 * A page that is never kept, answered by the network — or, when that does not answer, by the
 * kept page it asks something of (`standInFor`). Nothing is written to the cache here.
 */
export async function networkOrStandIn(event: FetchEvent, standIn: string): Promise<Response> {
	const cache = await caches.open(PAGES);
	const kept = await cache.match(standIn);
	const response = await networkWithin(event.request, kept !== undefined);
	noteServed(event, response ? null : (kept ?? null));
	if (response) return response;
	return kept ?? (await offlinePage()) ?? Response.error();
}
