import { describe, expect, it } from 'bun:test';
import { MOTION } from '../design/tokens';
import { tokensFor } from '../design/css-tokens';
import {
	cubicBezier,
	fadeMs,
	gapToTakeUp,
	glidePlan,
	glideToOpenedForm,
	openedFormGlide,
	scrollTopToShow,
	revealFrame,
	scrollBehavior,
	standardEasing
} from './motion';

const css = await Bun.file(new URL('../../app.css', import.meta.url)).text();

describe('the motion tokens (docs/05 §5.11)', () => {
	it('glides a height in 300 ms and fades in 200 ms, on one easing', () => {
		expect(MOTION.expandMs).toBe(300);
		expect(MOTION.fadeMs).toBe(200);
		expect(MOTION.easing).toBe('cubic-bezier(0.2, 0, 0, 1)');
	});

	it('says the same in app.css as in tokens.ts, so CSS and script never drift', () => {
		const tokens = tokensFor(css, 'light');
		expect(tokens.get('--motion-expand')).toBe(`${MOTION.expandMs}ms`);
		expect(tokens.get('--motion-fade')).toBe(`${MOTION.fadeMs}ms`);
		expect(tokens.get('--ease-standard')).toBe(MOTION.easing);
	});
});

describe('cubicBezier', () => {
	it('starts at 0 and ends at 1', () => {
		const ease = cubicBezier(0.2, 0, 0, 1);
		expect(ease(0)).toBe(0);
		expect(ease(1)).toBe(1);
	});

	it('follows the curve the browser draws for the same four numbers', () => {
		// Reference values solved independently by bisection on the Bézier's x(s).
		const ease = cubicBezier(0.2, 0, 0, 1);
		expect(ease(0.1)).toBeCloseTo(0.15625, 4);
		expect(ease(0.25)).toBeCloseTo(0.60722, 4);
		expect(ease(0.5)).toBeCloseTo(0.87783, 4);
	});

	it('is the identity for a linear curve', () => {
		const linear = cubicBezier(0, 0, 1, 1);
		for (const x of [0.1, 0.33, 0.5, 0.9]) expect(linear(x)).toBeCloseTo(x, 5);
	});

	it('clamps progress outside 0..1', () => {
		expect(standardEasing(-0.5)).toBe(0);
		expect(standardEasing(1.5)).toBe(1);
	});
});

describe('revealFrame', () => {
	/* Svelte hands the frame the eased position (`easing: standardEasing`), not the time, so a
	   close runs the same decelerating curve forwards and a reversal starts where the block is. */
	const atTime = (share: number) => revealFrame(standardEasing(share));

	it('is closed and invisible at the start, whole and opaque at the end', () => {
		expect(revealFrame(0)).toEqual({ height: 0, opacity: 0 });
		expect(revealFrame(1)).toEqual({ height: 1, opacity: 1 });
	});

	it('has the content fully faded in once the fade time has passed, while the height still glides', () => {
		const fadeDone = MOTION.fadeMs / MOTION.expandMs;
		expect(atTime(fadeDone).opacity).toBeCloseTo(1, 9);
		expect(atTime(fadeDone).height).toBeLessThan(1);
		expect(atTime(fadeDone / 2).opacity).toBeGreaterThan(0);
		expect(atTime(fadeDone / 2).opacity).toBeLessThan(1);
	});

	it('shows exactly as much of the height as the position says', () => {
		expect(revealFrame(0.42).height).toBe(0.42);
	});

	it('never grows past its height or shrinks back on the way', () => {
		let last = revealFrame(0);
		for (let step = 1; step <= 60; step++) {
			const frame = revealFrame(step / 60);
			expect(frame.height).toBeGreaterThanOrEqual(last.height);
			expect(frame.opacity).toBeGreaterThanOrEqual(last.opacity);
			expect(frame.opacity).toBeLessThanOrEqual(1);
			last = frame;
		}
	});
});

describe('glidePlan', () => {
	it('glides from the height on screen to the new one, in the expand time', () => {
		expect(glidePlan({ from: 40, to: 220, reducedMotion: false })).toEqual({
			from: 40,
			to: 220,
			durationMs: MOTION.expandMs,
			easing: MOTION.easing
		});
	});

	it('glides back down the same way', () => {
		expect(glidePlan({ from: 220, to: 0, reducedMotion: false })?.to).toBe(0);
	});

	it('does nothing when the height did not change', () => {
		expect(glidePlan({ from: 120, to: 120, reducedMotion: false })).toBeNull();
	});

	it('ignores a sub-pixel difference, which would only shimmer', () => {
		expect(glidePlan({ from: 120, to: 120.4, reducedMotion: false })).toBeNull();
	});

	it('switches at once for a reader who asked for less motion', () => {
		expect(glidePlan({ from: 40, to: 220, reducedMotion: true })).toBeNull();
	});
});

describe('fades and scrolling under reduced motion', () => {
	it('crossfades in the fade time, or not at all with reduced motion', () => {
		expect(fadeMs(false)).toBe(MOTION.fadeMs);
		expect(fadeMs(true)).toBe(0);
	});

	it('scrolls smoothly, or jumps with reduced motion', () => {
		expect(scrollBehavior(false)).toBe('smooth');
		expect(scrollBehavior(true)).toBe('auto');
	});
});

describe('gapToTakeUp', () => {
	it('takes up the gap before a block that has a sibling above it', () => {
		expect(gapToTakeUp({ gap: 24, siblingBefore: true, siblingAfter: true })).toEqual({
			top: -24,
			bottom: 0
		});
		expect(gapToTakeUp({ gap: 24, siblingBefore: true, siblingAfter: false })).toEqual({
			top: -24,
			bottom: 0
		});
	});

	it('takes up the gap after a first block instead', () => {
		expect(gapToTakeUp({ gap: 16, siblingBefore: false, siblingAfter: true })).toEqual({
			top: 0,
			bottom: -16
		});
	});

	it('has nothing to take up for an only child or a parent without a gap', () => {
		expect(gapToTakeUp({ gap: 16, siblingBefore: false, siblingAfter: false })).toEqual({
			top: 0,
			bottom: 0
		});
		expect(gapToTakeUp({ gap: 0, siblingBefore: true, siblingAfter: true })).toEqual({
			top: 0,
			bottom: 0
		});
	});
});

describe('glideToOpenedForm', () => {
	// The scroller's visible band, under the sticky jump bar: 100 px to 900 px.
	const view = { viewTop: 100, viewBottom: 900 };

	it('holds still when the card’s top is in the upper half of the view', () => {
		expect(glideToOpenedForm({ ...view, cardTop: 100 })).toBe(false);
		expect(glideToOpenedForm({ ...view, cardTop: 500 })).toBe(false);
	});

	it('glides a card whose top is low in the view, where its form would open below the fold', () => {
		expect(glideToOpenedForm({ ...view, cardTop: 501 })).toBe(true);
		expect(glideToOpenedForm({ ...view, cardTop: 880 })).toBe(true);
	});

	it('glides a card that is off screen, below or above', () => {
		expect(glideToOpenedForm({ ...view, cardTop: 2400 })).toBe(true);
		expect(glideToOpenedForm({ ...view, cardTop: -300 })).toBe(true);
	});

	it('glides a card whose top has slipped under the bar', () => {
		expect(glideToOpenedForm({ ...view, cardTop: 99 })).toBe(true);
	});
});

describe('scrollTopToShow', () => {
	// The scroller shows 100 px to 900 px of the screen (the band under the jump bar), it is
	// scrolled to 1000 and can go up to 3000.
	const scroller = { scrollTop: 1000, maxScrollTop: 3000, viewTop: 100, viewBottom: 900 };

	it('puts an element’s top just under the band’s top, less its own scroll margin', () => {
		const element = { top: 600, bottom: 800, marginTop: 16 };
		expect(scrollTopToShow({ ...scroller, element, block: 'start' })).toBe(1484);
	});

	it('stops where the scroller ends, at either end', () => {
		expect(
			scrollTopToShow({
				...scroller,
				element: { top: 3000, bottom: 3200, marginTop: 0 },
				block: 'start'
			})
		).toBe(3000);
		expect(
			scrollTopToShow({
				...scroller,
				element: { top: -5000, bottom: -4800, marginTop: 0 },
				block: 'start'
			})
		).toBe(0);
	});

	it('leaves an element already wholly in view where it is, for the nearest edge', () => {
		const element = { top: 200, bottom: 700, marginTop: 16 };
		expect(scrollTopToShow({ ...scroller, element, block: 'nearest' })).toBe(1000);
	});

	it('brings a foot below the band up to its bottom edge', () => {
		const element = { top: 500, bottom: 1100, marginTop: 0 };
		expect(scrollTopToShow({ ...scroller, element, block: 'nearest' })).toBe(1200);
	});

	it('shows the top of an element taller than the band, or one above it', () => {
		expect(
			scrollTopToShow({
				...scroller,
				element: { top: 300, bottom: 1500, marginTop: 0 },
				block: 'nearest'
			})
		).toBe(1200);
		expect(
			scrollTopToShow({
				...scroller,
				element: { top: 40, bottom: 400, marginTop: 0 },
				block: 'nearest'
			})
		).toBe(940);
	});
});

describe('openedFormGlide', () => {
	it('owes the settle the glide the opening made, once', () => {
		const owed = openedFormGlide();
		owed.opening();
		owed.opened(true);
		expect(owed.settle()).toBe(true);
		expect(owed.settle()).toBe(false);
	});

	it('owes nothing for a card that held still', () => {
		const owed = openedFormGlide();
		owed.opening();
		owed.opened(false);
		expect(owed.settle()).toBe(false);
	});

	it('starts every opening owing nothing, though an instant reveal settled before the last one glided', () => {
		// Reduced motion: the reveal ends at once, before the opener has measured the card.
		const owed = openedFormGlide();
		owed.opening();
		expect(owed.settle()).toBe(false);
		owed.opened(true);
		// The next opening of a card that holds still must not glide it to the top.
		owed.opening();
		expect(owed.settle()).toBe(false);
	});
});
