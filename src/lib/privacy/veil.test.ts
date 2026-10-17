import { describe, expect, test } from 'bun:test';
import {
	LOCKED,
	WINDOW_MS,
	hideOne,
	isTapped,
	isVeiled,
	leavePage,
	lockAll,
	openWindow,
	placeholderFor,
	revealPath,
	secondsLeft,
	showOne,
	timeLeftLabel,
	windowOpen
} from './veil';

/*
 * The private-entry veil (docs/02 §2.10.1): whether a private entry's content is blurred on
 * its author's screen, and what a tap on it or on the header lock does. "Now" is handed in.
 */
const NOW = 1_000_000;
const ON = true;

describe('isVeiled', () => {
	test('a private entry starts veiled while the member blurs', () => {
		expect(isVeiled(LOCKED, 'note:a', ON, NOW)).toBe(true);
	});

	test('nothing is veiled for a member who turned the switch off', () => {
		expect(isVeiled(LOCKED, 'note:a', false, NOW)).toBe(false);
	});

	test('a tap shows that one entry and no other', () => {
		const state = showOne(LOCKED, 'note:a');
		expect(isVeiled(state, 'note:a', ON, NOW)).toBe(false);
		expect(isVeiled(state, 'note:b', ON, NOW)).toBe(true);
		expect(isTapped(state, 'note:a', NOW)).toBe(true);
	});

	test('Hide blurs a tapped entry again', () => {
		const state = hideOne(showOne(LOCKED, 'note:a'), 'note:a');
		expect(isVeiled(state, 'note:a', ON, NOW)).toBe(true);
	});

	test('the window shows every entry for five minutes, then ends by itself', () => {
		const state = openWindow(LOCKED, NOW);
		expect(isVeiled(state, 'note:a', ON, NOW)).toBe(false);
		expect(isVeiled(state, 'photo:b', ON, NOW + WINDOW_MS - 1)).toBe(false);
		expect(windowOpen(state, NOW + WINDOW_MS - 1)).toBe(true);
		expect(isVeiled(state, 'note:a', ON, NOW + WINDOW_MS)).toBe(true);
		expect(windowOpen(state, NOW + WINDOW_MS)).toBe(false);
	});

	test('while the window is open a tapped entry offers no Hide of its own', () => {
		const state = openWindow(showOne(LOCKED, 'note:a'), NOW);
		expect(isTapped(state, 'note:a', NOW)).toBe(false);
		expect(isTapped(state, 'note:a', NOW + WINDOW_MS)).toBe(true);
	});
});

describe('locking', () => {
	test('leaving the page blurs what was tapped, but keeps the window', () => {
		const state = leavePage(openWindow(showOne(LOCKED, 'note:a'), NOW));
		expect(isTapped(state, 'note:a', NOW + WINDOW_MS)).toBe(false);
		expect(windowOpen(state, NOW + 1)).toBe(true);
	});

	test('locking, or Stella going to the background, blurs everything at once', () => {
		expect(lockAll()).toEqual(LOCKED);
		const state = lockAll();
		expect(isVeiled(state, 'note:a', ON, NOW)).toBe(true);
		expect(windowOpen(state, NOW)).toBe(false);
	});
});

describe('revealPath', () => {
	test('with device unlock set up here, a reveal asks for it and then opens the window', () => {
		expect(revealPath('set-up')).toBe('verify');
	});

	test('without it, or where the browser cannot, a tap is enough', () => {
		expect(revealPath('none')).toBe('tap');
		expect(revealPath('unsupported')).toBe('tap');
		expect(revealPath('checking')).toBe('tap');
	});
});

describe('the time left', () => {
	test('counts whole seconds down, rounding up so it never reads 0:00 while open', () => {
		const state = openWindow(LOCKED, NOW);
		expect(secondsLeft(state, NOW)).toBe(300);
		expect(secondsLeft(state, NOW + 1)).toBe(300);
		expect(secondsLeft(state, NOW + 1000)).toBe(299);
		expect(secondsLeft(state, NOW + WINDOW_MS)).toBe(0);
		expect(secondsLeft(LOCKED, NOW)).toBe(0);
	});

	test('reads as minutes and seconds', () => {
		expect(timeLeftLabel(299)).toBe('4:59');
		expect(timeLeftLabel(65)).toBe('1:05');
		expect(timeLeftLabel(9)).toBe('0:09');
	});
});

describe('placeholderFor', () => {
	test('keeps the shape of the text, so the blur looks like it, and none of its words', () => {
		const text = 'He asked me\nto keep it.';
		const shape = placeholderFor(text);
		expect(shape).toHaveLength(text.length);
		expect(shape.split(/\s/).map((word) => word.length)).toEqual(
			text.split(/\s/).map((word) => word.length)
		);
		expect(shape).toContain('\n');
		for (const word of ['asked', 'keep']) expect(shape).not.toContain(word);
	});

	test('reads the text of rendered Markdown, not its tags', () => {
		expect(placeholderFor('<p>Hi <strong>you</strong></p>')).toHaveLength('Hi you'.length);
		expect(placeholderFor('<p>A &amp; B</p>')).toHaveLength('A & B'.length);
	});

	test('is empty for nothing', () => {
		expect(placeholderFor('')).toBe('');
		expect(placeholderFor(null)).toBe('');
	});
});
