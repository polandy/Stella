import { describe, expect, it } from 'bun:test';
import { firstField, type FieldCandidate } from './first-field';

/*
 * The failure this guards against is a quiet one: a form whose first row is a hidden input
 * would "open" with the focus still on the button that opened it, and nothing on screen would
 * say why typing goes nowhere.
 */

const input = (over: Partial<FieldCandidate> = {}): FieldCandidate => ({
	tagName: 'INPUT',
	type: 'text',
	...over
});

describe('firstField', () => {
	it('takes the first control in document order', () => {
		const first = input();
		const second = input();
		expect(firstField([first, second])).toBe(first);
	});

	it('skips the hidden inputs a form carries its ids in', () => {
		const target = { tagName: 'SELECT' };
		expect(firstField([input({ type: 'hidden' }), input({ type: 'hidden' }), target])).toBe(target);
	});

	it('matches the type case-insensitively, as the DOM writes it', () => {
		const target = { tagName: 'TEXTAREA' };
		expect(firstField([input({ type: 'HIDDEN' }), target])).toBe(target);
	});

	it('skips a disabled control', () => {
		const target = input();
		expect(firstField([input({ disabled: true }), target])).toBe(target);
	});

	it('skips a control hidden by the `hidden` attribute', () => {
		const target = input();
		expect(firstField([input({ hidden: true }), target])).toBe(target);
	});

	it('skips a control the browser reports as hidden until found', () => {
		const target = input();
		expect(firstField([input({ hidden: 'until-found' }), target])).toBe(target);
	});

	it('keeps a control whose flags are merely absent', () => {
		const target = { tagName: 'BUTTON' };
		expect(firstField([target])).toBe(target);
	});

	it('answers null when nothing in the form can hold the cursor', () => {
		expect(firstField([input({ type: 'hidden' }), input({ disabled: true })])).toBeNull();
	});

	it('answers null for a form with no controls at all', () => {
		expect(firstField([])).toBeNull();
	});
});
