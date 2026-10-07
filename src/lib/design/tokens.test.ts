import { RELATIONSHIP_CATEGORIES } from '../relationships/categories';
import { describe, expect, it } from 'bun:test';
import {
	ACCENTS,
	AVATAR_ACCENTS,
	accentAvatarStyle,
	accentChipStyle,
	categoryDiscFill,
	accentDotStyle,
	accentVar,
	AVATAR_RING_PX,
	categoryVar,
	TINT_PERCENT
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

describe('accent styles', () => {
	it('tints a chip in its accent but writes the label in the foreground colour', () => {
		expect(accentChipStyle('teal')).toBe(
			'background:color-mix(in srgb, var(--accent-teal) var(--tint-chip), transparent);color:var(--fg)'
		);
	});

	it('deepens the tint when the chip is the active filter, opaque over the card', () => {
		// Latte's red at the active strength over the page ground is 4.11:1; over --card it
		// clears AA, so the active chip carries its own ground wherever it sits.
		expect(accentChipStyle('teal', { active: true })).toBe(
			'background:color-mix(in srgb, var(--accent-teal) var(--tint-chip-active), var(--card));color:var(--fg)'
		);
	});

	it('mixes an avatar over the card surface and rings it by the theme', () => {
		expect(accentAvatarStyle('blue')).toBe(
			'background:color-mix(in srgb, var(--accent-blue) var(--tint-avatar), var(--card));' +
				'box-shadow:inset 0 0 0 var(--avatar-ring) var(--accent-blue);color:var(--fg)'
		);
	});

	it('fills an SVG initials disc with a tint of its category over the card, like an avatar', () => {
		expect(categoryDiscFill('family')).toBe(
			'color-mix(in srgb, var(--cat-family) var(--tint-avatar), var(--card))'
		);
	});

	it('paints a dot in the flat accent, which carries no text', () => {
		expect(accentDotStyle('pink')).toBe('background:var(--accent-pink)');
	});
});

describe('tint strength per theme (docs/05 §5.2.2)', () => {
	it('keeps Latte at 22 / 16 / 28 and lifts Mocha to 28 / 22 / 28', () => {
		expect(TINT_PERCENT.light).toEqual({ avatar: 22, chip: 16, chipActive: 28 });
		expect(TINT_PERCENT.dark).toEqual({ avatar: 28, chip: 22, chipActive: 28 });
	});

	it('rings an initials avatar in the flat accent in Mocha only', () => {
		expect(AVATAR_RING_PX).toEqual({ light: 0, dark: 1.5 });
	});
});
