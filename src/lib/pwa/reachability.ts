/*
 * How a page learns that Stella is out of reach (docs/02 §2.18).
 *
 * Not `navigator.onLine`: it answers "is this device on a network", which is not the
 * question. Stella is on the household's own network, so a phone on mobile data is perfectly
 * online and cannot reach Stella at all — the case the offline story exists for. The only
 * thing that knows the truth is the service worker, which has just either fetched a page or
 * failed to and fallen back to the cache.
 *
 * So the worker reports, and the page asks on load rather than waiting for a report it might
 * have missed. These are the two messages that pass between them; pure, so both sides agree
 * on the wire format and a malformed message from anywhere else is rejected rather than
 * believed.
 */

/** A page asking the worker where things stand, because it has just been opened. */
export const ASK_REACHABILITY = 'stella:reachability?';

/** The worker's answer, sent in reply and again whenever it changes. */
export const REPORT_REACHABILITY = 'stella:reachability';

/** What the worker tells the pages it controls. */
export interface ReachabilityReport {
	type: typeof REPORT_REACHABILITY;
	/** Whether the last request the worker made actually got through to Stella. */
	reachable: boolean;
}

/** Whether `data` off a `message` event is a report, rather than anything else on the channel. */
export function isReachabilityReport(data: unknown): data is ReachabilityReport {
	if (typeof data !== 'object' || data === null) return false;
	const message = data as Record<string, unknown>;
	return message.type === REPORT_REACHABILITY && typeof message.reachable === 'boolean';
}
