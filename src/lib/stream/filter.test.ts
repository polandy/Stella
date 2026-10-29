import { describe, expect, it } from 'bun:test';
import {
	isNarrowed,
	NO_FILTER,
	offersMemberChoice,
	parseStreamFilter,
	streamFilterHref,
	withKind,
	withTag
} from './filter';

/*
 * The stream filter as the URL carries it (docs/02 §2.22.2): `?kind=` narrows to one kind of
 * item, `?by=` to one member, `?tag=` to the moments carrying one tag (§2.20.2). Anything the viewer could not have picked from the chips is
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
			memberId: 'u2',
			tag: null
		});
	});

	it('drops a kind the stream does not have', () => {
		expect(parseStreamFilter(params('kind=edit&by=u1'), members)).toEqual({
			kind: null,
			memberId: 'u1',
			tag: null
		});
	});

	it('drops a member who is not in the household', () => {
		expect(parseStreamFilter(params('kind=person&by=stranger'), members)).toEqual({
			kind: 'person',
			memberId: null,
			tag: null
		});
	});

	it('reads a tag as moments carrying it, by its key whatever the spelling', () => {
		expect(parseStreamFilter(params('tag=Gurten&by=u1'), members)).toEqual({
			kind: 'moment',
			memberId: 'u1',
			tag: 'gurten'
		});
		expect(parseStreamFilter(params('kind=moment&tag=%23Walk'), members).tag).toBe('walk');
	});

	it('drops a tag beside a kind that carries none, and an empty one', () => {
		expect(parseStreamFilter(params('kind=interaction&tag=walk'), members)).toEqual({
			kind: 'interaction',
			memberId: null,
			tag: null
		});
		expect(parseStreamFilter(params('tag=%20'), members)).toEqual(NO_FILTER);
	});
});

describe('streamFilterHref', () => {
	it('is Home itself for the whole stream', () => {
		expect(streamFilterHref(NO_FILTER)).toBe('/');
	});

	it('carries only the parts that are set, and reads back to the same filter', () => {
		const filter = { kind: 'interaction', memberId: 'u2', tag: null } as const;
		const href = streamFilterHref(filter);
		expect(href).toBe('/?kind=interaction&by=u2');
		expect(parseStreamFilter(new URL(href, 'http://x').searchParams, members)).toEqual(filter);
		expect(streamFilterHref({ kind: null, memberId: 'u1', tag: null })).toBe('/?by=u1');
	});

	it('carries a tag with the moments it narrows to, and reads back to the same filter', () => {
		const filter = { kind: 'moment', memberId: null, tag: 'ausflug-zürich' } as const;
		const href = streamFilterHref(filter);
		expect(href).toBe('/?kind=moment&tag=ausflug-z%C3%BCrich');
		expect(parseStreamFilter(new URL(href, 'http://x').searchParams, members)).toEqual(filter);
	});
});

describe('withTag and withKind', () => {
	const byOne = { kind: null, memberId: 'u1', tag: null };

	it('choosing a tag narrows to moments and keeps the member', () => {
		expect(withTag(byOne, 'walk')).toEqual({ kind: 'moment', memberId: 'u1', tag: 'walk' });
	});

	it('taking the tag off keeps the moments', () => {
		expect(withTag({ kind: 'moment', memberId: null, tag: 'walk' }, null)).toEqual({
			kind: 'moment',
			memberId: null,
			tag: null
		});
	});

	it('choosing another kind, or every kind, takes the tag off; moments keep it', () => {
		const tagged = { kind: 'moment', memberId: 'u1', tag: 'walk' } as const;
		expect(withKind(tagged, 'person')).toEqual({ kind: 'person', memberId: 'u1', tag: null });
		expect(withKind(tagged, null)).toEqual({ kind: null, memberId: 'u1', tag: null });
		expect(withKind(tagged, 'moment')).toEqual(tagged);
	});
});

describe('isNarrowed', () => {
	it('is false for the whole stream and true once either axis is set', () => {
		expect(isNarrowed(NO_FILTER)).toBe(false);
		expect(isNarrowed({ kind: 'notice', memberId: null, tag: null })).toBe(true);
		expect(isNarrowed({ kind: null, memberId: 'u1', tag: null })).toBe(true);
	});
});

describe('offersMemberChoice', () => {
	it('leaves the "who" choice out in a household of one, and offers it from two', () => {
		expect(offersMemberChoice(['u1'])).toBe(false);
		expect(offersMemberChoice(['u1', 'u2'])).toBe(true);
	});
});
