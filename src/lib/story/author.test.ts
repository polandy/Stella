import { describe, expect, it } from 'bun:test';
import { authorLabel, SELF_LABEL } from './author';

describe('authorLabel', () => {
	it('calls the viewer "you", whatever their account is named', () => {
		expect(authorLabel(true, 'Markus Brunner')).toBe(SELF_LABEL);
	});

	it('calls anyone else by the first part of their name', () => {
		expect(authorLabel(false, 'Markus Brunner')).toBe('Markus');
		expect(authorLabel(false, 'Lena')).toBe('Lena');
	});

	it('says nothing when the author is not a member any more', () => {
		expect(authorLabel(false, null)).toBeNull();
	});

	it('says nothing rather than an empty name for a blank account name', () => {
		expect(authorLabel(false, '   ')).toBeNull();
	});
});
