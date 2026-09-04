import { describe, expect, it } from 'bun:test';
import {
	ACCENTS,
	AVATAR_ACCENTS,
	RELATIONSHIP_CATEGORIES,
	accentAvatarStyle,
	accentChipStyle,
	accentDotStyle,
	accentVar,
	categoryVar,
	readableAccent
} from './tokens';
import { CIRCLE_COLORS } from '../server/domain/circles/circles';
import { TAG_COLORS } from '../server/domain/tags/tags';
import { INTERACTION_KINDS, KIND_PRESENTATION } from '../interactions/kinds';

describe('accents', () => {
	it('names each accent as its own semantic token', () => {
		expect(accentVar('mauve')).toBe('var(--accent-mauve)');
		expect(accentVar('lavender')).toBe('var(--accent-lavender)');
	});

	it('never leaks a raw Catppuccin flavour variable', () => {
		for (const accent of ACCENTS) expect(accentVar(accent)).not.toContain('--ctp-');
	});

	it('covers every colour the domain can persist on a tag or a circle', () => {
		for (const color of TAG_COLORS) expect(ACCENTS).toContain(color);
		for (const color of CIRCLE_COLORS) expect(ACCENTS).toContain(color);
	});

	it('keeps red out of generated avatar colours, so red stays a danger signal', () => {
		expect(ACCENTS).toContain('red');
		expect(AVATAR_ACCENTS).not.toContain('red');
		for (const accent of AVATAR_ACCENTS) expect(ACCENTS).toContain(accent);
	});
});

describe('relationship categories', () => {
	it('names each category as its own semantic token', () => {
		expect(categoryVar('family')).toBe('var(--cat-family)');
		expect(categoryVar('other')).toBe('var(--cat-other)');
	});

	it('covers the five categories the graph and the profile both render', () => {
		expect([...RELATIONSHIP_CATEGORIES]).toEqual([
			'family',
			'romantic',
			'social',
			'professional',
			'other'
		]);
	});
});

describe('interaction kinds', () => {
	it('gives every kind its own semantic token', () => {
		for (const kind of INTERACTION_KINDS) {
			expect(KIND_PRESENTATION[kind].accent).toBe(`var(--kind-${kind})`);
		}
	});
});

describe('readableAccent', () => {
	/*
	 * A pale tint needs a label darker than the accent in Latte and lighter than it in Mocha.
	 * Mixing toward `--fg` does both, because `--fg` is whichever end of the ramp reads.
	 */
	it('pulls the accent towards the foreground colour', () => {
		expect(readableAccent('yellow')).toBe('color-mix(in srgb, var(--accent-yellow) 68%, var(--fg))');
	});
});

describe('accent styles', () => {
	it('tints a chip in its accent and writes the label in a readable mix of it', () => {
		expect(accentChipStyle('teal')).toBe(
			'background:color-mix(in srgb, var(--accent-teal) 16%, transparent);' +
				'color:color-mix(in srgb, var(--accent-teal) 68%, var(--fg))'
		);
	});

	it('deepens the tint when the chip is the active filter', () => {
		expect(accentChipStyle('teal', { active: true })).toContain('var(--accent-teal) 28%');
	});

	it('mixes an avatar over the card surface, so it stays opaque on any background', () => {
		expect(accentAvatarStyle('blue')).toBe(
			'background:color-mix(in srgb, var(--accent-blue) 20%, var(--card));' +
				'color:color-mix(in srgb, var(--accent-blue) 68%, var(--fg))'
		);
	});

	it('paints a dot in the flat accent, which carries no text', () => {
		expect(accentDotStyle('pink')).toBe('background:var(--accent-pink)');
	});
});
