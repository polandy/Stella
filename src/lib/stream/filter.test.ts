import { describe, expect, it } from 'bun:test';
import {
	isNarrowed,
	NO_FILTER,
	offersMemberChoice,
	parseStreamFilter,
	streamFilterHref,
	toggleTag,
	withKind,
	withoutTags
} from './filter';

/*
 * The stream filter as the URL carries it (docs/02 §2.22.2): `?kind=` narrows to one kind of
 * item, `?by=` to one member, `?tag=` (once per tag) to the moments carrying
 * every one of them (§2.20.2). Anything the viewer could not have picked from the chips is dropped rather than trusted, so a stale or hand-edited link falls back to the whole stream.
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
			tags: []
		});
	});

	it('drops a kind the stream does not have', () => {
		expect(parseStreamFilter(params('kind=edit&by=u1'), members)).toEqual({
			kind: null,
			memberId: 'u1',
			tags: []
		});
	});

	it('drops a member who is not in the household', () => {
		expect(parseStreamFilter(params('kind=person&by=stranger'), members)).toEqual({
			kind: 'person',
			memberId: null,
			tags: []
		});
	});

	it('reads a tag as moments carrying it, by its key whatever the spelling', () => {
		expect(parseStreamFilter(params('tag=Gurten&by=u1'), members)).toEqual({
			kind: 'moment',
			memberId: 'u1',
			tags: ['gurten']
		});
		expect(parseStreamFilter(params('kind=moment&tag=%23Walk'), members).tags).toEqual(['walk']);
	});

	it('reads several tags in the order chosen, each once', () => {
		expect(parseStreamFilter(params('tag=Walk&tag=lake&tag=%23WALK'), members).tags).toEqual([
			'walk',
			'lake'
		]);
	});

	it('drops a tag beside a kind that carries none, and an empty one', () => {
		expect(parseStreamFilter(params('kind=interaction&tag=walk&tag=lake'), members)).toEqual({
			kind: 'interaction',
			memberId: null,
			tags: []
		});
		expect(parseStreamFilter(params('tag=%20'), members)).toEqual(NO_FILTER);
		expect(parseStreamFilter(params('tag=%20&tag=walk'), members).tags).toEqual(['walk']);
	});
});

describe('streamFilterHref', () => {
	it('is Home itself for the whole stream', () => {
		expect(streamFilterHref(NO_FILTER)).toBe('/');
	});

	it('carries only the parts that are set, and reads back to the same filter', () => {
		const filter = { kind: 'interaction', memberId: 'u2', tags: [] } as const;
		const href = streamFilterHref(filter);
		expect(href).toBe('/?kind=interaction&by=u2');
		expect(parseStreamFilter(new URL(href, 'http://x').searchParams, members)).toEqual(filter);
		expect(streamFilterHref({ kind: null, memberId: 'u1', tags: [] })).toBe('/?by=u1');
	});

	it('carries each tag with the moments it narrows to, and reads back to the same filter', () => {
		const filter = { kind: 'moment', memberId: null, tags: ['ausflug-zürich', 'walk'] } as const;
		const href = streamFilterHref(filter);
		expect(href).toBe('/?kind=moment&tag=ausflug-z%C3%BCrich&tag=walk');
		expect(parseStreamFilter(new URL(href, 'http://x').searchParams, members)).toEqual(filter);
	});
});

describe('toggleTag, withoutTags and withKind', () => {
	const byOne = { kind: null, memberId: 'u1', tags: [] };

	it('choosing a tag narrows to moments and keeps the member', () => {
		expect(toggleTag(byOne, 'walk')).toEqual({ kind: 'moment', memberId: 'u1', tags: ['walk'] });
	});

	it('choosing another tag adds it, so the moments must carry both', () => {
		const walk = { kind: 'moment', memberId: null, tags: ['walk'] } as const;
		expect(toggleTag(walk, 'lake').tags).toEqual(['walk', 'lake']);
	});

	it('choosing a chosen tag again takes only that one off, and the last one keeps the moments', () => {
		const both = { kind: 'moment', memberId: null, tags: ['walk', 'lake'] } as const;
		expect(toggleTag(both, 'walk').tags).toEqual(['lake']);
		expect(toggleTag(toggleTag(both, 'walk'), 'lake')).toEqual({
			kind: 'moment',
			memberId: null,
			tags: []
		});
	});

	it('taking the tags off keeps the moments', () => {
		expect(withoutTags({ kind: 'moment', memberId: null, tags: ['walk', 'lake'] })).toEqual({
			kind: 'moment',
			memberId: null,
			tags: []
		});
	});

	it('choosing another kind, or every kind, takes the tags off; moments keep them', () => {
		const tagged = { kind: 'moment', memberId: 'u1', tags: ['walk'] } as const;
		expect(withKind(tagged, 'person')).toEqual({ kind: 'person', memberId: 'u1', tags: [] });
		expect(withKind(tagged, null)).toEqual({ kind: null, memberId: 'u1', tags: [] });
		expect(withKind(tagged, 'moment')).toEqual(tagged);
	});
});

describe('isNarrowed', () => {
	it('is false for the whole stream and true once either axis is set', () => {
		expect(isNarrowed(NO_FILTER)).toBe(false);
		expect(isNarrowed({ kind: 'notice', memberId: null, tags: [] })).toBe(true);
		expect(isNarrowed({ kind: null, memberId: 'u1', tags: [] })).toBe(true);
	});
});

describe('offersMemberChoice', () => {
	it('leaves the "who" choice out in a household of one, and offers it from two', () => {
		expect(offersMemberChoice(['u1'])).toBe(false);
		expect(offersMemberChoice(['u1', 'u2'])).toBe(true);
	});
});
