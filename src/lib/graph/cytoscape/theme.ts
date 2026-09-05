import { AA_LARGE, ensureContrast, mixHex } from '../../design/color';
import { ACCENTS, categoryVar } from '../../design/tokens';
import type { RelationshipCategory } from '../model/types';

/*
 * Resolve the semantic design tokens (docs/05) into concrete hex values for the Cytoscape
 * canvas, which cannot read CSS custom properties itself. `resolvePalette` is pure — it takes
 * a token reader — so it unit-tests with a fake and works identically in light/dark; the DOM
 * helper wires it to the live computed styles and must be re-run when the theme changes.
 */

/** The semantic tokens the canvas needs, resolved to hex once per theme. */
export interface Palette {
	/** The interface font stack, so canvas labels match the page (docs/05 §5.3). */
	fontSans: string;
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
	/** The edge colours deepened until they clear 3:1 on the canvas (docs/05 §5.8). */
	lines: { categories: Record<RelationshipCategory, string>; membership: string; kinship: string };
}

/** Reads one custom property's resolved value; the DOM helper and the tests each supply one. */
export type TokenReader = (cssVariable: string) => string;

/** Strip the `var(--x)` wrapper a token helper returns, leaving the bare custom property. */
function propertyOf(token: string): string {
	return token.slice('var('.length, -1);
}

/** Build the palette from a token reader; pure, so it runs identically in tests and both themes. */
export function resolvePalette(read: TokenReader): Palette {
	const accents: Record<string, string> = {};
	for (const name of ACCENTS) accents[name] = read(`--accent-${name}`);

	const fg = read('--fg');
	const bg = read('--bg');
	// relationship categories → fixed accents (docs/05 §5.6)
	const categories: Record<RelationshipCategory, string> = {
		family: read(propertyOf(categoryVar('family'))),
		romantic: read(propertyOf(categoryVar('romantic'))),
		social: read(propertyOf(categoryVar('social'))),
		professional: read(propertyOf(categoryVar('professional'))),
		other: read(propertyOf(categoryVar('other')))
	};
	const membership = read('--edge-membership'); // circle edges
	const kinship = read('--edge-kinship'); // derived kinship: neutral, clearly inferred
	const onCanvas = (hex: string) => ensureContrast(hex, bg, fg, AA_LARGE);

	return {
		fontSans: read('--font-sans'),
		fg,
		fgMuted: read('--fg-muted'),
		fgSubtle: read('--fg-subtle'),
		bg,
		bgSunken: read('--bg-sunken'),
		card: read('--card'),
		border: read('--border'),
		primary: read('--primary'),
		focusRing: read('--focus-ring'),
		accents,
		categories,
		membership,
		kinship,
		lines: {
			categories: {
				family: onCanvas(categories.family),
				romantic: onCanvas(categories.romantic),
				social: onCanvas(categories.social),
				professional: onCanvas(categories.professional),
				other: onCanvas(categories.other)
			},
			membership: onCanvas(membership),
			kinship: onCanvas(kinship)
		}
	};
}

/** Live palette from the document's computed styles (browser only). */
export function paletteFromDom(root: Element = document.documentElement): Palette {
	const styles = getComputedStyle(root);
	return resolvePalette((cssVar) => styles.getPropertyValue(cssVar).trim());
}
