import { describe, expect, it } from 'bun:test';
import {
	giftLink,
	isGiftOccasionPreset,
	isGiftState,
	occasionFromForm,
	OTHER_OCCASION
} from './gifts';

/*
 * The words a gift is made of (docs/02 §2.25): its states, the occasions the form offers, and
 * the link it may carry. Pure, so the form, the command schema and the use-case agree on them.
 */

describe('isGiftState', () => {
	it('knows the three states and nothing else', () => {
		expect(['idea', 'given', 'received'].every(isGiftState)).toBe(true);
		expect(isGiftState('offered')).toBe(false);
		expect(isGiftState('')).toBe(false);
	});
});

describe('isGiftOccasionPreset', () => {
	it('names the occasions the form offers as chips', () => {
		expect(['birthday', 'christmas', 'anniversary'].every(isGiftOccasionPreset)).toBe(true);
	});

	it('leaves free text as what was typed', () => {
		expect(isGiftOccasionPreset('Housewarming')).toBe(false);
		expect(isGiftOccasionPreset('Birthday')).toBe(false);
	});
});

describe('occasionFromForm', () => {
	it('stores a chosen preset as its key', () => {
		expect(occasionFromForm('christmas', 'ignored')).toBe('christmas');
	});

	it('stores what was typed when *Other* was chosen', () => {
		expect(occasionFromForm(OTHER_OCCASION, '  Housewarming ')).toBe('Housewarming');
		expect(occasionFromForm(OTHER_OCCASION, '   ')).toBeNull();
	});

	it('stores nothing when nothing was chosen, or something that is not a choice', () => {
		expect(occasionFromForm(null, 'typed but not chosen')).toBeNull();
		expect(occasionFromForm('', null)).toBeNull();
		expect(occasionFromForm('easter', null)).toBeNull();
	});
});

describe('giftLink', () => {
	it('keeps a web address as it was typed', () => {
		expect(giftLink('https://shop.example/teapot?id=4')).toEqual({
			ok: true,
			url: 'https://shop.example/teapot?id=4'
		});
		expect(giftLink('http://shop.example')).toEqual({ ok: true, url: 'http://shop.example' });
	});

	it('reads an address pasted without its scheme as a secure web address', () => {
		expect(giftLink('  shop.example/teapot ')).toEqual({
			ok: true,
			url: 'https://shop.example/teapot'
		});
	});

	it('reads nothing as no link', () => {
		expect(giftLink('   ')).toEqual({ ok: true, url: null });
	});

	it('refuses anything that is not a web address, so a link can never run script', () => {
		expect(giftLink('javascript:alert(1)')).toEqual({ ok: false });
		expect(giftLink('JavaScript:alert(1)')).toEqual({ ok: false });
		expect(giftLink('data:text/html,hi')).toEqual({ ok: false });
		expect(giftLink('mailto:hilde@example.test')).toEqual({ ok: false });
		expect(giftLink('https://')).toEqual({ ok: false });
		expect(giftLink('two words')).toEqual({ ok: false });
	});
});
