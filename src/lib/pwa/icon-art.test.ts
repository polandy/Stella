import { describe, expect, it } from 'bun:test';
import { iconSvg, markReachFraction } from './icon-art';

/*
 * The one thing about an icon that is a fact rather than a taste: a maskable icon is cropped
 * to whatever shape the launcher likes, and only the centre 80% is guaranteed to survive.
 * Getting that wrong clips the mark on some phones and nowhere else, which is exactly the
 * bug nobody sees before shipping — so it is measured here instead of squinted at.
 */

/** The share of a maskable icon's edge the platform promises to keep: a centred 80% circle. */
const SAFE_ZONE_RADIUS_FRACTION = 0.4;

describe('the maskable icon', () => {
	it('keeps every corner of the mark inside the safe zone', () => {
		expect(markReachFraction('maskable')).toBeLessThanOrEqual(SAFE_ZONE_RADIUS_FRACTION);
	});

	it('still fills enough of it to be recognisable', () => {
		expect(markReachFraction('maskable')).toBeGreaterThan(SAFE_ZONE_RADIUS_FRACTION * 0.8);
	});
});

describe('the plain icon', () => {
	it('is drawn larger than the maskable one, having no crop to survive', () => {
		expect(markReachFraction('any')).toBeGreaterThan(markReachFraction('maskable'));
	});
});

describe('the icon document', () => {
	it('is opaque, so no launcher shows the home screen through it', () => {
		expect(iconSvg('any', 512)).toContain('<rect width="512" height="512" fill="#1e1e2e" />');
	});

	it('is square at whatever size it is asked for', () => {
		expect(iconSvg('any', 192)).toContain('width="192" height="192" viewBox="0 0 192 192"');
	});
});
