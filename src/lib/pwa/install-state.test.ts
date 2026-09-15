import { describe, expect, it } from 'bun:test';
import { installStateFrom } from './install-state';

describe('the install offer', () => {
	it('is made when the browser has handed us a prompt', () => {
		expect(installStateFrom({ installed: false, hasPrompt: true })).toBe('ready');
	});

	it('explains itself by hand when no prompt is coming — Safari, mainly', () => {
		expect(installStateFrom({ installed: false, hasPrompt: false })).toBe('unavailable');
	});

	it('is not made again once Stella is on the home screen', () => {
		expect(installStateFrom({ installed: true, hasPrompt: false })).toBe('installed');
	});

	it('is not made again even while a prompt is still being held', () => {
		// Chromium can hold a prompt for an app that is already installed; offering to install
		// it a second time reads as a bug to the person looking at the card.
		expect(installStateFrom({ installed: true, hasPrompt: true })).toBe('installed');
	});
});
