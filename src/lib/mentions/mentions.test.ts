import { describe, expect, it } from 'bun:test';
import {
	extractHandles,
	createHandleResolver,
	extractMentionIds,
	mentionKey,
	resolveMentions,
	segmentMentions,
	type MentionCandidate
} from './mentions';

/*
 * The shared mention parser/resolver (docs/02 §2.20.1). Pure and framework-agnostic: it turns
 * typed `@FirstnameLastname` handles into a stable, id-based canonical token, extracts the
 * referenced contact ids for persistence, and segments a body for chip rendering. Resolution is
 * caller-supplied (the edge builds it from the contacts visible to the entry's audience), so a
 * mention can never resolve to someone the author can't reference.
 */

const CONTACTS: MentionCandidate[] = [
	{ id: 'anna', firstName: 'Anna', lastName: 'Weber', displayName: 'Anna Weber' },
	{ id: 'sandra', firstName: 'Sandra', lastName: 'Brunner', displayName: 'Sandra Brunner' },
	{ id: 'sabine-mueller', firstName: 'Sabine', lastName: 'Müller', displayName: 'Sabine Müller' }
];

describe('mentionKey', () => {
	it('normalises case, spaces and punctuation so typed handles match names', () => {
		expect(mentionKey('Anna Weber')).toBe('annaweber');
		expect(mentionKey('AnnaWeber')).toBe('annaweber');
		expect(mentionKey("Anne-Marie O'Neil")).toBe('annemarieoneil');
		expect(mentionKey('Sabine Müller')).toBe('sabinemüller');
	});
});

describe('resolveMentions', () => {
	const resolve = createHandleResolver(CONTACTS);

	it('turns a unique typed handle into a canonical, id-based token', () => {
		const { body, ids } = resolveMentions('hiked with @SandraBrunner today', resolve);
		expect(body).toBe('hiked with @{contact:sandra} today');
		expect(ids).toEqual(['sandra']);
	});

	it('is case-insensitive and matches umlaut names', () => {
		expect(resolveMentions('@annaweber', resolve).body).toBe('@{contact:anna}');
		expect(resolveMentions('@SabineMüller', resolve).ids).toEqual(['sabine-mueller']);
	});

	it('matches @FirstnameLastname even when the display name is a hyphenated/married form', () => {
		const r = createHandleResolver([
			{ id: 'sandra', firstName: 'Sandra', lastName: 'Brunner', displayName: 'Sandra Brunner-Keller' }
		]);
		// first+last handle resolves…
		expect(resolveMentions('@SandraBrunner', r).ids).toEqual(['sandra']);
		// …and so does the full display name
		expect(resolveMentions('@SandraBrunnerKeller', r).ids).toEqual(['sandra']);
	});

	it('passes existing canonical tokens through and still collects their id', () => {
		const { body, ids } = resolveMentions('saw @{contact:anna} at lunch', resolve);
		expect(body).toBe('saw @{contact:anna} at lunch');
		expect(ids).toEqual(['anna']);
	});

	it('dedupes ids across typed and canonical mentions, preserving order', () => {
		const { ids } = resolveMentions('@AnnaWeber and @{contact:anna} and @SandraBrunner', resolve);
		expect(ids).toEqual(['anna', 'sandra']);
	});

	it('leaves an unknown handle as literal text with no id', () => {
		const { body, ids } = resolveMentions('met @NobodyHere', resolve);
		expect(body).toBe('met @NobodyHere');
		expect(ids).toEqual([]);
	});

	it('leaves an ambiguous handle unresolved (two people, same first+last)', () => {
		const dupes = createHandleResolver([
			{ id: 'anna-1', firstName: 'Anna', lastName: 'Weber', displayName: 'Anna Weber' },
			{ id: 'anna-2', firstName: 'Anna', lastName: 'Weber', displayName: 'Anna Weber (cousin)' }
		]);
		const { body, ids } = resolveMentions('@AnnaWeber', dupes);
		expect(body).toBe('@AnnaWeber');
		expect(ids).toEqual([]);
	});

	it('does not treat an email address as a mention', () => {
		const { body, ids } = resolveMentions('mail anna@example.com about it', resolve);
		expect(body).toBe('mail anna@example.com about it');
		expect(ids).toEqual([]);
	});

	it('honours the \\@ escape and keeps it escaped (idempotent)', () => {
		const once = resolveMentions('rate \\@SandraBrunner stars', resolve);
		expect(once.body).toBe('rate \\@SandraBrunner stars');
		expect(once.ids).toEqual([]);
		// running again must not suddenly turn it into a mention
		expect(resolveMentions(once.body, resolve).ids).toEqual([]);
	});

	it('is idempotent on an already-normalised body', () => {
		const first = resolveMentions('with @AnnaWeber', resolve).body;
		expect(resolveMentions(first, resolve).body).toBe(first);
	});
});

describe('extractHandles', () => {
	it('lists typed handles once each, in order, skipping tokens and escapes', () => {
		expect(extractHandles('with @Julia and @Marco, @Julia again, @{contact:c1}, \\@literal')).toEqual([
			'Julia',
			'Marco'
		]);
	});

	it('ignores e-mail-like text', () => {
		expect(extractHandles('mail anna@example.com')).toEqual([]);
	});
});

describe('extractMentionIds', () => {
	it('reads unique ids from canonical tokens only, in order', () => {
		expect(extractMentionIds('a @{contact:anna} b @{contact:sandra} c @{contact:anna}')).toEqual([
			'anna',
			'sandra'
		]);
	});

	it('ignores typed handles that were never resolved', () => {
		expect(extractMentionIds('just @AnnaWeber text')).toEqual([]);
	});
});

describe('segmentMentions', () => {
	it('splits a body into text and mention segments for chip rendering', () => {
		expect(segmentMentions('hi @{contact:anna}!')).toEqual([
			{ type: 'text', value: 'hi ' },
			{ type: 'mention', id: 'anna' },
			{ type: 'text', value: '!' }
		]);
	});

	it('returns a single text segment when there are no mentions', () => {
		expect(segmentMentions('nothing here')).toEqual([{ type: 'text', value: 'nothing here' }]);
	});
});
