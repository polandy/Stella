import { RELATIONSHIP_CATEGORIES } from '../relationships/categories';
import { describe, expect, it } from 'bun:test';
import {
	AA_LARGE,
	AA_TEXT,
	contrastRatio,
	ensureContrast,
	mixHex,
	relativeLuminance
} from './color';
import { resolveColor, tokensFor, type Theme } from './css-tokens';
import { ACCENTS, AVATAR_ACCENTS, AVATAR_TINT_PERCENT, accentVar, categoryVar } from './tokens';
import { INTERACTION_KINDS } from '../interactions/kinds';

/*
 * The design system lives in two files that TypeScript cannot tie together: the custom
 * properties in `app.css` and the names `tokens.ts` builds for inline styles. These tests hold
 * them to each other, and hold the contrast ratios docs/05 §5.9 promises to their floors — a
 * renamed token or a re-picked grey now fails here instead of silently unsetting a colour or
 * quietly dropping text below AA.
 */

const css = await Bun.file(new URL('../../app.css', import.meta.url)).text();
const THEMES: Theme[] = ['light', 'dark', 'system-dark'];

/** The property name inside a `var(--x)` string, as the token helpers return it. */
const property = (token: string) => token.slice('var('.length, -1);

describe('contrastRatio', () => {
	it('is 21 for black on white and 1 for a colour on itself', () => {
		expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
		expect(contrastRatio('#8839ef', '#8839ef')).toBeCloseTo(1, 5);
	});

	it('does not care which colour is given first', () => {
		expect(contrastRatio('#4c4f69', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#4c4f69'), 9);
	});

	it('expands three-digit hex', () => {
		expect(relativeLuminance('#fff')).toBeCloseTo(relativeLuminance('#ffffff'), 9);
	});

	it('refuses a value that is not a hex colour', () => {
		expect(() => contrastRatio('rebeccapurple', '#fff')).toThrow('Not a hex colour');
	});
});

describe('ensureContrast', () => {
	it('leaves a colour alone when it already clears the floor', () => {
		expect(ensureContrast('#1e66f5', '#e6e9ef', '#4c4f69', AA_LARGE)).toBe('#1e66f5');
	});

	it('deepens a colour toward the text colour until it clears the floor, and no further', () => {
		const deepened = ensureContrast('#ea76cb', '#e6e9ef', '#4c4f69', AA_LARGE);

		expect(deepened).not.toBe('#ea76cb');
		expect(contrastRatio(deepened, '#e6e9ef')).toBeGreaterThanOrEqual(AA_LARGE);
		// One step back would have failed, so this is the lightest passing blend.
		expect(contrastRatio(mixHex('#4c4f69', 5, deepened), '#e6e9ef')).toBeGreaterThan(
			contrastRatio(deepened, '#e6e9ef')
		);
	});

	it('ends at the text colour itself when nothing short of it clears the floor', () => {
		expect(ensureContrast('#ffffff', '#ffffff', '#000000', 21)).toBe('#000000');
	});
});

describe('reading app.css', () => {
	it('fails loudly when a theme block is gone, rather than reporting an empty palette', () => {
		expect(() => tokensFor(':root { --fg: #000; }', 'dark')).toThrow('No block for selector');
	});

	it('fails loudly on an unterminated block', () => {
		expect(() => tokensFor(":root[data-theme='dark'] { --fg: #000;", 'dark')).toThrow();
	});

	it('gives up on a var() chain that never reaches a colour', () => {
		const circular = new Map([
			['--a', 'var(--b)'],
			['--b', 'var(--a)']
		]);
		expect(resolveColor(circular, '--a')).toBeNull();
	});

	it('returns null for a value that is not a colour, so callers can skip it', () => {
		const tokens = new Map([['--shadow-card', '0 1px 2px rgb(0 0 0 / 0.3)']]);
		expect(resolveColor(tokens, '--shadow-card')).toBeNull();
		expect(resolveColor(tokens, '--missing')).toBeNull();
	});
});

describe('app.css declares every token the helpers build', () => {
	for (const theme of THEMES) {
		const tokens = tokensFor(css, theme);

		it(`resolves every accent, category and kind token to a colour in ${theme}`, () => {
			const expected = [
				...ACCENTS.map((a) => property(accentVar(a))),
				...RELATIONSHIP_CATEGORIES.map((c) => property(categoryVar(c))),
				...INTERACTION_KINDS.map((k) => `--kind-${k}`),
				'--edge-membership',
				'--edge-kinship'
			];
			const unresolved = expected.filter((name) => resolveColor(tokens, name) === null);
			expect(unresolved).toEqual([]);
		});

		it(`resolves the surface and text tokens to a colour in ${theme}`, () => {
			const surfaces = [
				'--bg',
				'--bg-sunken',
				'--card',
				'--card-hover',
				'--border',
				'--border-input',
				'--fg',
				'--fg-muted',
				'--fg-subtle',
				'--primary',
				'--primary-fg',
				'--success-text'
			];
			const unresolved = surfaces.filter((name) => resolveColor(tokens, name) === null);
			expect(unresolved).toEqual([]);
		});
	}

	it('keeps the two dark blocks identical, since CSS cannot share one', () => {
		const explicit = tokensFor(css, 'dark');
		const systemDark = tokensFor(css, 'system-dark');
		const drift = [...explicit.keys()].filter(
			(name) => explicit.get(name) !== systemDark.get(name)
		);
		expect(drift).toEqual([]);
		expect([...systemDark.keys()].sort()).toEqual([...explicit.keys()].sort());
	});
});

describe('AA contrast, both themes (docs/05 §5.9)', () => {
	/** The pairs the interface actually puts on screen, and the floor each has to clear. */
	const PAIRS: { text: string; on: string; floor: number }[] = [
		{ text: '--fg', on: '--card', floor: AA_TEXT },
		{ text: '--fg', on: '--bg', floor: AA_TEXT },
		{ text: '--fg', on: '--bg-sunken', floor: AA_TEXT },
		{ text: '--fg-muted', on: '--card', floor: AA_TEXT },
		{ text: '--fg-muted', on: '--bg', floor: AA_TEXT },
		{ text: '--fg-muted', on: '--bg-sunken', floor: AA_TEXT },
		{ text: '--fg-subtle', on: '--card', floor: AA_TEXT },
		// Meta text on the page ground: 3.9:1, so it only ever repeats what is already on screen.
		{ text: '--fg-subtle', on: '--bg', floor: AA_LARGE },
		{ text: '--primary-fg', on: '--primary', floor: AA_TEXT },
		// Words written in a colour, wherever they land: a link, a primary action, a warning.
		{ text: '--link', on: '--card', floor: AA_TEXT },
		{ text: '--link', on: '--bg', floor: AA_TEXT },
		{ text: '--primary', on: '--card', floor: AA_TEXT },
		{ text: '--primary', on: '--bg', floor: AA_TEXT },
		{ text: '--danger', on: '--card', floor: AA_TEXT },
		{ text: '--danger', on: '--bg', floor: AA_TEXT },
		// "Create …" in the mention list is written in green; Latte's flat green is 3.3:1 on a card.
		{ text: '--success-text', on: '--card', floor: AA_TEXT },
		// The edge of a text field is what tells it is one (1.4.11): 3:1 on the card it sits in
		// and on the page ground that is also its own fill.
		{ text: '--border-input', on: '--card', floor: AA_LARGE },
		{ text: '--border-input', on: '--bg', floor: AA_LARGE },
		{ text: '--border', on: '--card', floor: 1.2 },
		// A focus indicator is a non-text boundary: 3:1 against whatever it is drawn over.
		{ text: '--focus-ring', on: '--card', floor: AA_LARGE },
		{ text: '--focus-ring', on: '--bg', floor: AA_LARGE },
		{ text: '--focus-ring', on: '--bg-sunken', floor: AA_LARGE },
		// The explorer's lines are non-text boundaries on the page ground (docs/05 §5.8). These
		// tokens are drawn as they are, at full opacity: the inferred kinship line, and a line of
		// no known category with its arrowhead. The accent-coloured lines are deepened on the
		// canvas instead, and held to the same floor as drawn in `graph/cytoscape/theme.test.ts`.
		// (A deceased person's ring is `--fg-subtle`, the "+N" badge `--fg` on `--card`: both
		// are held above.)
		{ text: '--edge-kinship', on: '--bg', floor: AA_LARGE },
		{ text: '--cat-other', on: '--bg', floor: AA_LARGE }
	];

	for (const theme of THEMES) {
		const tokens = tokensFor(css, theme);
		for (const { text, on, floor } of PAIRS) {
			it(`${text} on ${on} clears ${floor}:1 in ${theme}`, () => {
				const foreground = resolveColor(tokens, text);
				const background = resolveColor(tokens, on);
				if (foreground === null || background === null) {
					throw new Error(`${text} or ${on} does not resolve to a colour in ${theme}`);
				}
				expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(floor);
			});
		}
	}
});

/*
 * Chips and avatars tint a surface with an accent and write on top of it. The accent is *not*
 * the label colour: in Latte most accents land between 2.6:1 and 3.7:1 against a tint of
 * themselves, below AA at any size, which is why `accentChipStyle` and `accentAvatarStyle`
 * write in `--fg` (docs/05 §5.6). These cases hold that pairing to the AA floor, so a future
 * change back to a coloured label fails here rather than in a screenshot.
 */
describe('text on an accent tint', () => {
	/** Mirrors the tints `tokens.ts` emits, so a percentage change there shows up here. */
	const TINTS = [
		{ what: 'chip', percent: 16, over: '--card' },
		{ what: 'chip', percent: 16, over: '--bg' },
		{ what: 'active chip', percent: 28, over: '--card' },
		{ what: 'avatar', percent: 22, over: '--card' }
	];

	for (const theme of THEMES) {
		const tokens = tokensFor(css, theme);
		for (const { what, percent, over } of TINTS) {
			it(`reads --fg on every ${what} tint over ${over} in ${theme}`, () => {
				const fg = resolveColor(tokens, '--fg');
				const surface = resolveColor(tokens, over);
				expect(fg).not.toBeNull();
				expect(surface).not.toBeNull();

				const failing = ACCENTS.filter((accent) => {
					const color = resolveColor(tokens, property(accentVar(accent)));
					const tint = mixHex(color as string, percent, surface as string);
					return contrastRatio(fg as string, tint) < AA_TEXT;
				});
				expect(failing).toEqual([]);
			});
		}

		// The ego graph's initials discs: a category tint, initials in --fg (docs/05 §5.9).
		it(`reads --fg on every category disc over --card in ${theme}`, () => {
			const fg = resolveColor(tokens, '--fg');
			const card = resolveColor(tokens, '--card');
			expect(fg).not.toBeNull();
			expect(card).not.toBeNull();

			const failing = RELATIONSHIP_CATEGORIES.filter((category) => {
				const color = resolveColor(tokens, property(categoryVar(category)));
				const tint = mixHex(color as string, AVATAR_TINT_PERCENT, card as string);
				return contrastRatio(fg as string, tint) < AA_TEXT;
			});
			expect(failing).toEqual([]);
		});
	}
});

describe('accents as fills', () => {
	for (const theme of THEMES) {
		const tokens = tokensFor(css, theme);

		it(`keeps every avatar accent a distinct hue from the card in ${theme}`, () => {
			const card = resolveColor(tokens, '--card');
			for (const accent of AVATAR_ACCENTS) {
				const color = resolveColor(tokens, property(accentVar(accent)));
				expect(color).not.toBeNull();
				// A dot or disc is not text, and it never carries meaning alone — the name it sits
				// beside does. It only has to be visibly a colour, not a 3:1 boundary.
				expect(contrastRatio(color as string, card as string)).toBeGreaterThan(1.2);
			}
		});

		it(`resolves every category to a colour in ${theme}`, () => {
			// No floor here: as chips and dots the categories sit beside a label. On the canvas,
			// where an edge carries its category alone, `theme.test.ts` holds them to 3:1.
			for (const category of RELATIONSHIP_CATEGORIES) {
				expect(resolveColor(tokens, property(categoryVar(category)))).not.toBeNull();
			}
		});
	}
});

/*
 * The offline line (docs/05 §5.7) is tinted with `--warning` so it is not missed, but the
 * yellow is only the ground and the icon: the words stay in `--fg`, which has to read on the
 * tint in every theme. The percentage mirrors `--warning-soft` in app.css.
 */
describe('text on the offline tint', () => {
	const WARNING_SOFT_PERCENT = 18;

	it('declares the tint the offline line is painted with', () => {
		expect(css).toContain(
			`--warning-soft: color-mix(in srgb, var(--warning) ${WARNING_SOFT_PERCENT}%, transparent)`
		);
	});

	for (const theme of THEMES) {
		const tokens = tokensFor(css, theme);

		it(`reads --fg on the warning tint over --bg in ${theme}`, () => {
			const fg = resolveColor(tokens, '--fg');
			const warning = resolveColor(tokens, '--warning');
			const ground = resolveColor(tokens, '--bg');
			if (fg === null || warning === null || ground === null) {
				throw new Error(`--fg, --warning or --bg does not resolve to a colour in ${theme}`);
			}
			const tint = mixHex(warning, WARNING_SOFT_PERCENT, ground);
			expect(contrastRatio(fg, tint)).toBeGreaterThanOrEqual(AA_TEXT);
		});
	}
});

/*
 * Words on a state tint — the error banner on `--danger-soft`, an active filter chip or the
 * highlighted Filter pill on `--primary-soft` — are written in `--fg` (docs/05 §5.6): the state
 * colour itself drops below AA on its own tint in Latte (danger 4.0:1, primary 3.8:1 over the
 * page ground). The percentages mirror app.css and MenuButton.svelte.
 */
describe('text on a state tint', () => {
	const DANGER_SOFT_PERCENT = 10;
	const PRIMARY_SOFT_PERCENT = 14;
	const MENU_HIGHLIGHT_PERCENT = 18;

	it('declares the tints those surfaces are painted with', () => {
		expect(css).toContain(
			`--danger-soft: color-mix(in srgb, var(--danger) ${DANGER_SOFT_PERCENT}%, transparent)`
		);
		expect(css).toContain(
			`--primary-soft: color-mix(in srgb, var(--primary) ${PRIMARY_SOFT_PERCENT}%, transparent)`
		);
	});

	const TINTS = [
		{ state: '--danger', percent: DANGER_SOFT_PERCENT, over: '--bg' },
		{ state: '--danger', percent: DANGER_SOFT_PERCENT, over: '--card' },
		{ state: '--primary', percent: PRIMARY_SOFT_PERCENT, over: '--bg' },
		{ state: '--primary', percent: PRIMARY_SOFT_PERCENT, over: '--card' },
		{ state: '--primary', percent: MENU_HIGHLIGHT_PERCENT, over: '--card' }
	];

	for (const theme of THEMES) {
		const tokens = tokensFor(css, theme);
		for (const { state, percent, over } of TINTS) {
			it(`reads --fg on ${percent}% ${state} over ${over} in ${theme}`, () => {
				const fg = resolveColor(tokens, '--fg');
				const color = resolveColor(tokens, state);
				const ground = resolveColor(tokens, over);
				if (fg === null || color === null || ground === null) {
					throw new Error(`--fg, ${state} or ${over} does not resolve to a colour in ${theme}`);
				}
				expect(contrastRatio(fg, mixHex(color, percent, ground))).toBeGreaterThanOrEqual(AA_TEXT);
			});
		}

		// The mention list's "Create …" row is green on a highlighted (primary-soft) row as well.
		it(`reads --success-text on a highlighted row in ${theme}`, () => {
			const success = resolveColor(tokens, '--success-text');
			const primary = resolveColor(tokens, '--primary');
			const card = resolveColor(tokens, '--card');
			if (success === null || primary === null || card === null) {
				throw new Error(`--success-text, --primary or --card does not resolve in ${theme}`);
			}
			expect(
				contrastRatio(success, mixHex(primary, PRIMARY_SOFT_PERCENT, card))
			).toBeGreaterThanOrEqual(AA_TEXT);
		});
	}
});
