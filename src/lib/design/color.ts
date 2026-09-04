/*
 * Colour maths for the design system: blending two colours the way CSS `color-mix(in srgb, …)`
 * does, and WCAG 2.1 contrast, so docs/05 §5.9's accessibility promise is a test rather than a
 * claim. Pure arithmetic over hex colours — no DOM, no colour library.
 */

/** WCAG AA needs this ratio for body text, and 3:1 for large text and UI boundaries. */
export const AA_TEXT = 4.5;
export const AA_LARGE = 3;

/** Expand `#abc` to `#aabbcc` and read the three channels as 0–255. */
function channels(hex: string): [number, number, number] {
	const digits = hex.replace('#', '');
	const full =
		digits.length === 3
			? digits
					.split('')
					.map((d) => d + d)
					.join('')
			: digits;
	if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`Not a hex colour: ${hex}`);
	return [
		parseInt(full.slice(0, 2), 16),
		parseInt(full.slice(2, 4), 16),
		parseInt(full.slice(4, 6), 16)
	];
}

/** sRGB → linear light, per WCAG's transfer function. */
function linearize(channel: number): number {
	const c = channel / 255;
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance of a hex colour (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
	const [r, g, b] = channels(hex).map(linearize);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two hex colours, from 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
	const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
	return (lighter + 0.05) / (darker + 0.05);
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Blend `accent` `pct`% into `base`, both `#rgb`/`#rrggbb`, and return `#rrggbb`.
 *
 * The canvas renderer parses colours itself and rejects CSS functions, so a `color-mix()`
 * string is silently dropped and the element loses that colour entirely — the mixing has to
 * happen here. A colour we cannot parse is returned as the accent, which still renders.
 */
export function mixHex(accent: string, pct: number, base: string): string {
	if (!HEX.test(accent) || !HEX.test(base)) return accent;
	const a = channels(accent);
	const b = channels(base);
	const w = Math.min(100, Math.max(0, pct)) / 100;
	const out = a.map((v, i) => Math.round(v * w + b[i] * (1 - w)));
	return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('');
}
