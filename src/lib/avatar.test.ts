import { describe, expect, it } from 'bun:test';
import { avatarAccent, initials } from './avatar';
import { AVATAR_ACCENTS } from './design/tokens';

describe('initials', () => {
	it('takes the first and last word initial', () => {
		expect(initials('Mara Keller')).toBe('MK');
		expect(initials('Anna Maria Rossi')).toBe('AR');
	});
	it('uses two letters of a single name', () => {
		expect(initials('Cher')).toBe('CH');
	});
	it('falls back to ? for an empty name', () => {
		expect(initials('   ')).toBe('?');
	});
});

describe('avatarAccent', () => {
	it('is deterministic for an id', () => {
		expect(avatarAccent('abc')).toBe(avatarAccent('abc'));
	});
	it('spreads across several accents', () => {
		const seen = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(avatarAccent));
		expect(seen.size).toBeGreaterThan(1);
	});
	it('only ever picks an accent avatars may use, so nobody is drawn in the danger colour', () => {
		const allowed: readonly string[] = AVATAR_ACCENTS;
		const ids = Array.from({ length: 200 }, (_, i) => `contact-${i}`);
		const outside = ids.map(avatarAccent).filter((accent) => !allowed.includes(accent));
		expect(outside).toEqual([]);
	});
});
