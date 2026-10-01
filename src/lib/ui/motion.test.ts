import { describe, expect, it } from 'bun:test';
import { MOTION_ATTRIBUTE, motionAttribute, wantsLessMotion } from './motion';

/*
 * Less motion has two sources (docs/05 §5.5): the device's own `prefers-reduced-motion`, and
 * the member's switch in Settings, carried on `<html data-motion>`. Either one is enough; the
 * switch never turns motion back on for a device that asked for less.
 */
describe('wantsLessMotion', () => {
	it('follows the device when the member has not asked', () => {
		expect(wantsLessMotion({ device: true, attribute: 'auto' })).toBe(true);
		expect(wantsLessMotion({ device: false, attribute: 'auto' })).toBe(false);
	});

	it('follows the member’s switch on a device that has not asked', () => {
		expect(wantsLessMotion({ device: false, attribute: 'reduce' })).toBe(true);
	});

	it('treats a page without the attribute as not asked', () => {
		expect(wantsLessMotion({ device: false, attribute: undefined })).toBe(false);
	});
});

describe('motionAttribute', () => {
	it('writes the member’s choice as the value the stylesheet matches', () => {
		expect(MOTION_ATTRIBUTE).toBe('data-motion');
		expect(motionAttribute(true)).toBe('reduce');
		expect(motionAttribute(false)).toBe('auto');
	});
});
