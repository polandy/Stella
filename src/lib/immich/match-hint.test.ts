import { describe, expect, it } from 'bun:test';
import { asksForMatchHint, matchHintName, shownMatchHint } from './match-hint';

/*
 * The Photos card's suggestion (docs/02 §2.24.7): asked for only where it could be shown, and
 * shown only while it still holds — never offline, never for a linked person, never once ignored.
 */

const unlinkedOnline = { immichOn: true, online: true, linked: false };
const lena = { personId: 'p-lena', name: 'Lena Brunner' };

describe('asksForMatchHint', () => {
	it('asks for an unlinked person, online, with Immich on the instance', () => {
		expect(asksForMatchHint(unlinkedOnline)).toBe(true);
	});

	it('does not ask without Immich, offline, or for a linked person', () => {
		expect(asksForMatchHint({ ...unlinkedOnline, immichOn: false })).toBe(false);
		expect(asksForMatchHint({ ...unlinkedOnline, online: false })).toBe(false);
		expect(asksForMatchHint({ ...unlinkedOnline, linked: true })).toBe(false);
	});
});

describe('shownMatchHint', () => {
	it('shows the face Immich proposed', () => {
		expect(shownMatchHint({ ...unlinkedOnline, answer: lena, ignored: false })).toBe(lena);
	});

	it('shows nothing before an answer, or when there is no likely face', () => {
		expect(shownMatchHint({ ...unlinkedOnline, answer: null, ignored: false })).toBeNull();
	});

	it('shows nothing once ignored, offline, or linked — though the answer is still at hand', () => {
		expect(shownMatchHint({ ...unlinkedOnline, answer: lena, ignored: true })).toBeNull();
		expect(
			shownMatchHint({ ...unlinkedOnline, online: false, answer: lena, ignored: false })
		).toBeNull();
		expect(
			shownMatchHint({ ...unlinkedOnline, linked: true, answer: lena, ignored: false })
		).toBeNull();
	});
});

describe('matchHintName', () => {
	it('asks by the name the household calls them: the nickname, else the first name', () => {
		expect(matchHintName({ displayName: 'Lena Brunner', firstName: 'Lena', nickname: null })).toBe(
			'Lena'
		);
		expect(
			matchHintName({ displayName: 'Ursula Brunner', firstName: 'Ursula', nickname: 'Grosi' })
		).toBe('Grosi');
	});

	it('falls back to the shown name when there is no first name', () => {
		expect(matchHintName({ displayName: 'Dr. Meier', firstName: null, nickname: null })).toBe(
			'Dr. Meier'
		);
		expect(matchHintName({ displayName: 'Dr. Meier', firstName: '', nickname: '' })).toBe(
			'Dr. Meier'
		);
	});
});
