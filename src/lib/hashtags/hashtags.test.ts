import { describe, expect, it } from 'bun:test';
import { hashtagAt, hashtagsIn, tagAccent, tagKey } from './hashtags';
import { AVATAR_ACCENTS } from '../design/tokens';

describe('hashtagsIn', () => {
	it('finds each tag once, first spelling kept, in order of first use', () => {
		expect(hashtagsIn('#Holiday at the lake, #swim and more #holiday')).toEqual([
			'Holiday',
			'swim'
		]);
	});

	it('takes letters with umlauts, digits, hyphen and underscore', () => {
		expect(hashtagsIn('#Ausflug_2026 #grün #new-year')).toEqual([
			'Ausflug_2026',
			'grün',
			'new-year'
		]);
	});

	it('ends a tag at punctuation, and a hyphen only joins words', () => {
		expect(hashtagsIn('So nice (#lake). Then #walk-, #a--b!')).toEqual(['lake', 'walk', 'a']);
	});

	it('needs a boundary before the #', () => {
		expect(hashtagsIn('mail#x C#sharp https://x.org/#anchor &#38; ##double')).toEqual([]);
	});

	it('skips an escaped \\#', () => {
		expect(hashtagsIn('Room \\#4 and \\#lake')).toEqual([]);
	});

	it('needs a letter: a number is not a tag', () => {
		expect(hashtagsIn('We were #1 and #2026')).toEqual([]);
	});

	it('ignores code spans and fenced code', () => {
		expect(hashtagsIn('`#not` and\n```\n#nope\n```\n#yes')).toEqual(['yes']);
	});

	it('reads a tag at the start of a line or after a mention token', () => {
		expect(hashtagsIn('#first\n@{contact:abc} #second')).toEqual(['first', 'second']);
	});

	it('treats differently composed umlauts as one tag', () => {
		expect(hashtagsIn('#grün #grün')).toEqual(['grün']);
	});
});

describe('hashtagAt', () => {
	it('reads the tag starting at a #', () => {
		expect(hashtagAt('a #lake b', 2)).toEqual({ name: 'lake', end: 7 });
	});

	it('refuses a # without a boundary before it', () => {
		expect(hashtagAt('a#lake', 1)).toBeNull();
	});
});

describe('tagKey', () => {
	it('folds case and composition', () => {
		expect(tagKey('Grün')).toBe(tagKey('grün'));
		expect(tagKey('Holiday')).toBe('holiday');
	});
});

describe('tagAccent', () => {
	it('gives one spelling and another the same avatar-safe accent', () => {
		expect(tagAccent('Holiday')).toBe(tagAccent('holiday'));
		expect(AVATAR_ACCENTS).toContain(tagAccent('holiday'));
	});
});
