import { ACCENTS, categoryVar } from '../../design/tokens';
import type { RelationshipCategory } from '../model/types';

/*
 * Resolve the semantic design tokens (docs/05) into concrete hex values for the Cytoscape
 * canvas, which cannot read CSS custom properties itself. `resolvePalette` is pure — it takes
 * a token reader — so it unit-tests with a fake and works identically in light/dark; the DOM
 * helper wires it to the live computed styles and must be re-run when the theme changes.
 */

export interface Palette {
	fg: string;
	fgMuted: string;
	fgSubtle: string;
	bg: string;
	bgSunken: string;
	card: string;
	border: string;
	primary: string;
	focusRing: string;
	accents: Record<string, string>;
	categories: Record<RelationshipCategory, string>;
	membership: string;
	kinship: string;
}

export type TokenReader = (cssVariable: string) => string;

/** Strip the `var(--x)` wrapper a token helper returns, leaving the bare custom property. */
function propertyOf(token: string): string {
	return token.slice('var('.length, -1);
}

export function resolvePalette(read: TokenReader): Palette {
	const accents: Record<string, string> = {};
	for (const name of ACCENTS) accents[name] = read(`--accent-${name}`);

	return {
		fg: read('--fg'),
		fgMuted: read('--fg-muted'),
		fgSubtle: read('--fg-subtle'),
		bg: read('--bg'),
		bgSunken: read('--bg-sunken'),
		card: read('--card'),
		border: read('--border'),
		primary: read('--primary'),
		focusRing: read('--focus-ring'),
		accents,
		// relationship categories → fixed accents (docs/05 §5.6)
		categories: {
			family: read(propertyOf(categoryVar('family'))),
			romantic: read(propertyOf(categoryVar('romantic'))),
			social: read(propertyOf(categoryVar('social'))),
			professional: read(propertyOf(categoryVar('professional'))),
			other: read(propertyOf(categoryVar('other')))
		},
		membership: read('--edge-membership'), // circle edges
		kinship: read('--edge-kinship') // derived kinship: neutral, clearly inferred
	};
}

/** Live palette from the document's computed styles (browser only). */
export function paletteFromDom(root: Element = document.documentElement): Palette {
	const styles = getComputedStyle(root);
	return resolvePalette((cssVar) => styles.getPropertyValue(cssVar).trim());
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const channels = (hex: string): [number, number, number] => {
	const h = hex.slice(1);
	const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
	return [
		parseInt(full.slice(0, 2), 16),
		parseInt(full.slice(2, 4), 16),
		parseInt(full.slice(4, 6), 16)
	];
};

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
