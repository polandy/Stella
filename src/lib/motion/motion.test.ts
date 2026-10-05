import { describe, expect, it } from 'bun:test';
import { MOTION } from '../design/tokens';
import { tokensFor } from '../design/css-tokens';
import {
	cubicBezier,
	fadeMs,
	gapToTakeUp,
	glidePlan,
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
		expect(gapToTakeUp({ gap: 24, siblingBefore: true, siblingAfter: true })).toEqual({ top: -24, bottom: 0 });
		expect(gapToTakeUp({ gap: 24, siblingBefore: true, siblingAfter: false })).toEqual({ top: -24, bottom: 0 });
	});

	it('takes up the gap after a first block instead', () => {
		expect(gapToTakeUp({ gap: 16, siblingBefore: false, siblingAfter: true })).toEqual({ top: 0, bottom: -16 });
	});

	it('has nothing to take up for an only child or a parent without a gap', () => {
		expect(gapToTakeUp({ gap: 16, siblingBefore: false, siblingAfter: false })).toEqual({ top: 0, bottom: 0 });
		expect(gapToTakeUp({ gap: 0, siblingBefore: true, siblingAfter: true })).toEqual({ top: 0, bottom: 0 });
	});
});
