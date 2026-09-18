import { describe, expect, it } from 'bun:test';
import { NO_FILTER, parseStreamFilter, streamFilterHref } from './filter';

/*
 * The stream filter as the URL carries it (docs/02 §2.22.2): `?kind=` narrows to one kind of
 * item, `?by=` to one member. Anything the viewer could not have picked from the chips is
 * dropped rather than trusted, so a stale or hand-edited link falls back to the whole stream.
 */

const members = ['u1', 'u2'];
const params = (query: string) => new URLSearchParams(query);

describe('parseStreamFilter', () => {
	it('reads no parameters as the whole stream', () => {
		expect(parseStreamFilter(params(''), members)).toEqual(NO_FILTER);
	});

	it('reads a kind and a member', () => {
		expect(parseStreamFilter(params('kind=moment&by=u2'), members)).toEqual({
			kind: 'moment',
			memberId: 'u2'
		});
	});

	it('drops a kind the stream does not have', () => {
		expect(parseStreamFilter(params('kind=edit&by=u1'), members)).toEqual({
			kind: null,
			memberId: 'u1'
		});
	});

	it('drops a member who is not in the household', () => {
		expect(parseStreamFilter(params('kind=person&by=stranger'), members)).toEqual({
			kind: 'person',
			memberId: null
		});
	});
});

describe('streamFilterHref', () => {
	it('is Home itself for the whole stream', () => {
		expect(streamFilterHref(NO_FILTER)).toBe('/');
	});

	it('carries only the parts that are set, and reads back to the same filter', () => {
		const filter = { kind: 'interaction', memberId: 'u2' } as const;
		const href = streamFilterHref(filter);
		expect(href).toBe('/?kind=interaction&by=u2');
		expect(parseStreamFilter(new URL(href, 'http://x').searchParams, members)).toEqual(filter);
		expect(streamFilterHref({ kind: null, memberId: 'u1' })).toBe('/?by=u1');
	});
});
