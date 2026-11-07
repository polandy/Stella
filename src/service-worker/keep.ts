/// <reference lib="webworker" />

/*
 * Writing to the pages cache: the one `put` every copy goes through, so a full device gives up
 * its oldest photos wherever the write came from (docs/02 §2.18).
 */

import { holdsPageData } from '$lib/pwa/cache-policy';
import { isStorageFull, mediaToEvict } from '$lib/pwa/storage-full';
import { isOwnAnswer, worker } from './scope';

/**
 * Keep `response` under `key` if it is Stella's own answer — and, for a page's data, the page
 * itself rather than the redirect a lapsed session gets with a 200 (`holdsPageData`). The body
 * is read from a copy, so `response` can still be served. False when it was not kept.
 */
export async function keepCopy(
	cache: Cache,
	key: string,
	response: Response,
	pageData: boolean
): Promise<boolean> {
	if (!isOwnAnswer(response) || !response.ok) return false;
	if (pageData && !holdsPageData(await response.clone().text())) return false;
	return put(cache, key, response);
}

/**
 * Keep `response` under `key`. A full device gives up its oldest photos and tries once more
 * (docs/02 §2.18); still full, nothing is kept and false says so, so a refresh stops there
 * instead of failing. Any other failure is thrown.
 */
export async function put(cache: Cache, key: string, response: Response): Promise<boolean> {
	const spare = response.clone();
	try {
		await cache.put(key, response);
		return true;
	} catch (error) {
		if (!isStorageFull(error)) throw error;
	}
	await makeRoom(cache);
	try {
		await cache.put(key, spare);
		return true;
	} catch (error) {
		if (!isStorageFull(error)) throw error;
		return false;
	}
}

/** Delete the oldest kept photos (`mediaToEvict`); they are fetched again when next seen. */
async function makeRoom(cache: Cache): Promise<void> {
	const kept = await Promise.all(
		(await cache.keys()).map(async (request) => ({
			key: request.url,
			date: (await cache.match(request))?.headers.get('date') ?? null
		}))
	);
	await Promise.all(mediaToEvict(kept, worker.location.origin).map((key) => cache.delete(key)));
}
