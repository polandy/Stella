import { describe, expect, it } from 'bun:test';
import {
	CHECK_REACHABILITY,
	REPORT_REACHABILITY,
	checkMessage,
	isReachabilityReport,
	probeSays,
	readCheck
} from './reachability';

/*
 * A page's message channel is shared with anything else that cares to post to it, so the
 * guard is what stops a stray message putting the offline banner up — or, worse, taking it
 * down while Stella is still unreachable.
 */

describe('a reachability report', () => {
	it('is recognised when the worker sends one', () => {
		expect(isReachabilityReport({ type: REPORT_REACHABILITY, reachable: false, keptAt: 1 })).toBe(
			true
		);
		expect(isReachabilityReport({ type: REPORT_REACHABILITY, reachable: true, keptAt: null })).toBe(
			true
		);
	});

	it('is rejected when it says the page was kept at something that is not a time', () => {
		expect(
			isReachabilityReport({ type: REPORT_REACHABILITY, reachable: false, keptAt: 'yesterday' })
		).toBe(false);
	});

	it('still counts from a worker older than the age of a copy, as a report of no known age', () => {
		// During an update the page of the new build can still hear the previous worker for a
		// moment. Rejecting its report would leave the offline line away while Stella is out of reach.
		expect(isReachabilityReport({ type: REPORT_REACHABILITY, reachable: false })).toBe(true);
	});

	it('is not confused with another message on the same channel', () => {
		expect(isReachabilityReport({ type: 'workbox-broadcast', reachable: true, keptAt: null })).toBe(
			false
		);
		expect(isReachabilityReport('stella:reachability')).toBe(false);
	});

	it('is rejected when it does not actually say anything', () => {
		expect(isReachabilityReport({ type: REPORT_REACHABILITY })).toBe(false);
		expect(isReachabilityReport({ type: REPORT_REACHABILITY, reachable: 'no' })).toBe(false);
		expect(isReachabilityReport(null)).toBe(false);
		expect(isReachabilityReport(undefined)).toBe(false);
	});
});

/*
 * A check runs when something changed under the page without a request to notice it: the
 * connection dropped, the app came back into view (docs/02 §2.18, *Saying so*).
 */
describe('what a reachability check concludes', () => {
	const stella = { ok: true, type: 'basic' as const, body: { status: 'ok' } };

	it('says reachable when Stella answers its health check', () => {
		expect(probeSays({ deviceOnline: true, answer: stella })).toBe(true);
	});

	it('says out of reach at once when the device itself has no network, whatever answered', () => {
		expect(probeSays({ deviceOnline: false, answer: stella })).toBe(false);
	});

	it('says out of reach when nothing answered in time', () => {
		expect(probeSays({ deviceOnline: true, answer: null })).toBe(false);
	});

	it('says out of reach when Stella answers with an error', () => {
		expect(probeSays({ deviceOnline: true, answer: { ...stella, ok: false, body: null } })).toBe(
			false
		);
	});

	it('does not take a login page of a foreign network for Stella', () => {
		// A captive portal answers every address with its own page, and a 200 at that.
		expect(
			probeSays({
				deviceOnline: true,
				answer: { ...stella, body: '<html>Sign in to Wi-Fi</html>' }
			})
		).toBe(false);
		expect(
			probeSays({ deviceOnline: true, answer: { ...stella, type: 'opaqueredirect', body: null } })
		).toBe(false);
	});
});

/*
 * The page hears `offline` and `online` before the worker's own `navigator.onLine` has caught
 * up, so a check carries what the page saw. Trusting the worker's lagging view kept From Immich
 * enabled offline (pwa-offline.spec.ts, PR #425).
 */
describe('a reachability check', () => {
	it('carries what the page saw of the device', () => {
		expect(readCheck(checkMessage(false))).toEqual({ deviceOnline: false });
		expect(readCheck(checkMessage(true))).toEqual({ deviceOnline: true });
	});

	it('from a page older than that still counts, leaving the device to the worker', () => {
		// During an update the new worker can still hear a page of the previous build for a moment.
		expect(readCheck(CHECK_REACHABILITY)).toEqual({ deviceOnline: null });
	});

	it('is not confused with another message on the same channel', () => {
		expect(readCheck({ type: CHECK_REACHABILITY, deviceOnline: 'no' })).toBeNull();
		expect(readCheck({ type: REPORT_REACHABILITY, reachable: true })).toBeNull();
		expect(readCheck('stella:reachability?')).toBeNull();
		expect(readCheck(null)).toBeNull();
	});
});
