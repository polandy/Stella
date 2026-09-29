import { describe, expect, it } from 'bun:test';
import { REPORT_REACHABILITY, isReachabilityReport } from './reachability';

/*
 * A page's message channel is shared with anything else that cares to post to it, so the
 * guard is what stops a stray message putting the offline banner up — or, worse, taking it
 * down while Stella is still unreachable.
 */

describe('a reachability report', () => {
	it('is recognised when the worker sends one', () => {
		expect(isReachabilityReport({ type: REPORT_REACHABILITY, reachable: false, keptAt: 1 })).toBe(true);
		expect(isReachabilityReport({ type: REPORT_REACHABILITY, reachable: true, keptAt: null })).toBe(true);
	});

	it('says when the page on screen was kept, or null when it came from Stella just now', () => {
		expect(isReachabilityReport({ type: REPORT_REACHABILITY, reachable: false })).toBe(false);
		expect(isReachabilityReport({ type: REPORT_REACHABILITY, reachable: false, keptAt: 'yesterday' })).toBe(
			false
		);
	});

	it('is not confused with another message on the same channel', () => {
		expect(isReachabilityReport({ type: 'workbox-broadcast', reachable: true, keptAt: null })).toBe(false);
		expect(isReachabilityReport('stella:reachability')).toBe(false);
	});

	it('is rejected when it does not actually say anything', () => {
		expect(isReachabilityReport({ type: REPORT_REACHABILITY })).toBe(false);
		expect(isReachabilityReport({ type: REPORT_REACHABILITY, reachable: 'no' })).toBe(false);
		expect(isReachabilityReport(null)).toBe(false);
		expect(isReachabilityReport(undefined)).toBe(false);
	});
});
