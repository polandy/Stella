/*
 * Read the token layers back out of `app.css`.
 *
 * The design system is written twice: as CSS custom properties in `app.css`, and as the names
 * `tokens.ts` builds for inline styles. Nothing in the type system ties those two together — a
 * renamed custom property leaves every helper compiling and every colour silently unset. This
 * module parses the stylesheet so a test can assert the halves still agree, and so the
 * documented contrast ratios (docs/05 §5.9) are checked rather than claimed.
 *
 * Test-only: it is not imported by the app, which reads these values through the cascade.
 */

/** The three states a viewer can be in (docs/05 §5.2.2). */
export type Theme = 'light' | 'dark' | 'system-dark';

/** The selector that carries each theme's palette. */
const THEME_BLOCKS: Record<Theme, string> = {
	light: ":root,\n:root[data-theme='light']",
	dark: ":root[data-theme='dark']",
	'system-dark': ":root:not([data-theme='light'])"
};

/** The theme-independent block every semantic token is defined in. */
const SEMANTIC_BLOCK = ':root';

const DECLARATION = /(--[\w-]+)\s*:\s*([^;]+);/g;

/**
 * Every `--name: value` pair inside the block that starts at `selector`.
 * Naive brace matching is enough here: the token blocks contain no nested rules.
 */
function declarationsIn(css: string, selector: string): Map<string, string> {
	const start = css.indexOf(`${selector} {`);
	if (start === -1) throw new Error(`No block for selector ${selector} in app.css`);
	const open = css.indexOf('{', start);
	const end = css.indexOf('\n}', open);
	if (end === -1) throw new Error(`Unterminated block for selector ${selector} in app.css`);

	const body = css.slice(open + 1, end);
	const out = new Map<string, string>();
	for (const [, name, value] of body.matchAll(DECLARATION)) out.set(name, value.trim());
	return out;
}

/** The custom properties one theme resolves against: its palette plus the semantic layer. */
export function tokensFor(css: string, theme: Theme): Map<string, string> {
	const merged = new Map(declarationsIn(css, THEME_BLOCKS[theme]));
	for (const [name, value] of declarationsIn(css, SEMANTIC_BLOCK)) merged.set(name, value);
	return merged;
}

/** Guards a `var()` chain that never bottoms out in a literal. */
const MAX_INDIRECTION = 10;

/**
 * Follow `var(--a)` → `var(--b)` → `#hex` for one token. Returns `null` for a value that is not
 * a plain reference or hex colour (a shadow, a `color-mix`, a font stack), which the caller is
 * expected to treat as "not a resolvable colour" rather than as a failure.
 */
export function resolveColor(tokens: Map<string, string>, name: string): string | null {
	let value = tokens.get(name);
	for (let hop = 0; hop < MAX_INDIRECTION && value !== undefined; hop++) {
		const trimmed = value.trim();
		if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) return trimmed.toLowerCase();

		const reference = /^var\((--[\w-]+)\)$/.exec(trimmed);
		if (!reference) return null;
		value = tokens.get(reference[1]);
	}
	return null;
}
