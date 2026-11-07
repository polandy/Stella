/// <reference lib="webworker" />

/*
 * Whether Stella is in reach, as the worker has seen it, and how old the page in each window
 * is — told to the pages so the offline banner matches reality (docs/02 §2.18, *Saying so*).
 */

import { isPageData, keptAt } from '$lib/pwa/cache-policy';
import {
	PROBE_PATH,
	REPORT_REACHABILITY,
	probeSays,
	type ReachabilityReport
} from '$lib/pwa/reachability';
import { describe, fetchAhead, worker } from './scope';

/*
 * Whether the last request actually reached Stella. The worker is the only party that knows:
 * `navigator.onLine` in the page answers "is this device on a network", and a phone on mobile
 * data is online while the household's Stella is entirely out of reach.
 */
let reachable = true;

/** Whether the last request reached Stella. */
export const isReachable = (): boolean => reachable;

/*
 * When the page each open window shows was kept, if it came off the device: the offline line
 * says how old it is (docs/02 §2.18, *Saying so*). Null once Stella answered it.
 * Keyed by client id, because two windows can show copies of different ages. Never pruned: a
 * window being navigated is not yet among the open ones, so pruning could drop the entry it is
 * about to ask for; and the browser stops an idle worker, map and all, within minutes.
 */
const keptAtByClient = new Map<string, number | null>();

/** What to tell the window `clientId` about where things stand. */
export function reportFor(clientId: string): ReachabilityReport {
	return { type: REPORT_REACHABILITY, reachable, keptAt: keptAtByClient.get(clientId) ?? null };
}

/** Tell every open page where things stand, so the offline banner matches reality. */
async function report(): Promise<void> {
	const clients = await worker.clients.matchAll({ type: 'window' });
	for (const client of clients) client.postMessage(reportFor(client.id));
}

/**
 * Record where the page answering `event` came from. A whole page is shown by the window it
 * creates, which asks once it has loaded; a page's data is shown by a window already open, so
 * that one is told now.
 */
export function noteServed(event: FetchEvent, kept: Response | null): void {
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

/**
 * How often a page has said the device lost its network. A request sent before the latest of
 * those was in flight when the network went, and can still be answered a moment later: that
 * answer is about before, and must not make Stella reachable again over the page's newer word.
 */
let deviceWentOffline = 0;

/** The mark a request takes when sent, to hand back to `noteAnswered` once it is answered. */
export const sendMark = (): number => deviceWentOffline;

/** Record what a request turned out to prove, and tell the pages only when it changed. */
export function noteReachability(nowReachable: boolean): void {
	if (nowReachable === reachable) return;
	reachable = nowReachable;
	void report();
}

/** Record that Stella answered a request sent when `sentAt` was `deviceWentOffline`. */
export function noteAnswered(sentAt: number): void {
	if (sentAt === deviceWentOffline) noteReachability(true);
}

/** The check under way, so a burst of events (offline, then hidden, then shown) asks once. */
let reachabilityCheck: Promise<void> | null = null;

/**
 * Find out whether Stella answers, without waiting for a page's request to show it. A device
 * without a network settles it at once, and does not join a probe already under way, which
 * would answer for the network as it was.
 */
export function checkReachability(deviceOnline: boolean): Promise<void> {
	if (!deviceOnline) {
		deviceWentOffline += 1;
		// A probe under way answers for the network as it was: the next check starts its own.
		reachabilityCheck = null;
		noteReachability(probeSays({ deviceOnline, answer: null }));
		return Promise.resolve();
	}
	if (reachabilityCheck) return reachabilityCheck;
	const check = probe().finally(() => {
		if (reachabilityCheck === check) reachabilityCheck = null;
	});
	reachabilityCheck = check;
	return check;
}

async function probe(): Promise<void> {
	const sentAt = deviceWentOffline;
	const response = await fetchAhead(PROBE_PATH);
	const answer = response && {
		ok: response.ok,
		type: response.type,
		body: await response.json().catch(() => null)
	};
	if (!probeSays({ deviceOnline: true, answer })) noteReachability(false);
	else noteAnswered(sentAt);
}
