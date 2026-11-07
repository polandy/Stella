/// <reference lib="webworker" />

/*
 * Keeping pages before they are read: the `KEPT_AHEAD` pages and every person the member can
 * see (docs/02 §2.18, docs/04 ADR-114). `$lib/pwa/people-ahead` decides; this runs the plan.
 */

import { KEPT_AHEAD, NETWORK_PATIENCE_MS, cacheKeyFor } from '$lib/pwa/cache-policy';
import {
	VISIBLE_PEOPLE_PATH,
	isNewerCopy,
	keysToPrune,
	parseVisiblePeople,
	peopleToKeep,
	refreshDue
} from '$lib/pwa/people-ahead';
import { keepCopy, put } from './keep';
import { isReachable } from './reachability';
import { PAGES, fetchAhead, isOwnAnswer, worker } from './scope';

/** Fetch and keep each `KEPT_AHEAD` page this build's cache does not hold yet. */
export async function keepAhead(): Promise<void> {
	const cache = await caches.open(PAGES);
	for (const path of KEPT_AHEAD) {
		if (await cache.match(path)) continue;
		// Bounded: `activate` waits for this, and every request waits for `activate`.
		const signal = AbortSignal.timeout(NETWORK_PATIENCE_MS);
		const response = await fetch(path, { signal }).catch(() => null);
		// Redirected means signed out: that is the sign-in page, not the one asked for.
		if (response?.ok && response.type === 'basic' && !response.redirected) {
			if (!(await put(cache, path, response))) return;
		}
	}
}

/** When the last refresh of the people finished, so opening pages in a row does not repeat it. */
let lastPeopleRefresh: number | null = null;
/** The refresh under way, so a second page opening joins it rather than starting another. */
let peopleRefresh: Promise<void> | null = null;

/**
 * Keep every person the member can see readable offline (docs/02 §2.18, docs/04 ADR-114):
 * drop the pages of anyone no longer visible, then revalidate each person's pages and fetch
 * the avatars not yet kept. One request at a time, in the background, while Stella answers.
 */
export function refreshPeople(): Promise<void> {
	if (peopleRefresh) return peopleRefresh;
	if (!isReachable() || !refreshDue(lastPeopleRefresh, Date.now())) return Promise.resolve();
	peopleRefresh = keepPeopleAhead().finally(() => {
		peopleRefresh = null;
	});
	return peopleRefresh;
}

async function keepPeopleAhead(): Promise<void> {
	const listed = await fetchAhead(VISIBLE_PEOPLE_PATH);
	if (!isOwnAnswer(listed) || !listed.ok) return;
	// Nothing is pruned on an answer that is not a list: that would empty the device.
	const people = parseVisiblePeople(await listed.json().catch(() => null));
	if (!people) return;

	const cache = await caches.open(PAGES);
	const kept = (await cache.keys()).map((request) => request.url);
	const visible = new Set(people.map((person) => person.id));
	await Promise.all(
		keysToPrune(kept, worker.location.origin, visible).map((key) => cache.delete(key))
	);

	const { pages, avatars } = peopleToKeep(people);
	for (const page of pages) {
		// Out of reach or signed out part-way: stop, and try again on the next page opening.
		if (!(await revalidate(cache, page))) return;
	}
	for (const avatar of avatars) {
		if (await cache.match(avatar)) continue;
		const response = await fetchAhead(avatar);
		if (!isOwnAnswer(response) || !response.ok) return;
		// The device is full even after giving up photos: the rest would not fit either.
		if (!(await put(cache, avatar, response))) return;
	}
	lastPeopleRefresh = Date.now();
}

/**
 * Bring one page's kept data up to date: asked with the tag of the copy held, so an unchanged
 * page costs a bodiless 304. False when Stella did not answer as itself.
 */
async function revalidate(cache: Cache, path: string): Promise<boolean> {
	const url = new URL(path, worker.location.origin).href;
	const key = cacheKeyFor({
		method: 'GET',
		url,
		origin: worker.location.origin,
		isNavigation: false
	});
	const held = await cache.match(key);
	const etag = held?.headers.get('etag');
	const response = await fetchAhead(path, etag ? { 'If-None-Match': etag } : {});
	if (!isOwnAnswer(response)) return false;

	if (response.status === 304 && held) {
		// Confirmed current just now: the copy takes the answer's date, so the offline line
		// says how old the *knowledge* is, not when the bytes first arrived.
		const headers = new Headers(held.headers);
		const date = response.headers.get('date');
		if (date) headers.set('date', date);
		return put(
			cache,
			key,
			new Response(await held.arrayBuffer(), { status: held.status, headers })
		);
	}
	if (!response.ok) return response.status === 404;
	if (isNewerCopy(response.headers.get('date'), held?.headers.get('date') ?? null)) {
		// Not kept means signed out part-way: the rest would get the same answer.
		return keepCopy(cache, key, response, true);
	}
	return true;
}
