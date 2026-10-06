import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import { otherEndRole, relationshipRoleLabel } from './roles';

/*
 * Who somebody on a person's People card is *to that person* (docs/05 §5.5): Lena on her
 * father's page is his daughter, not "Parent of". The row is read from the page's side, so the
 * role is the type's other side, said as a noun.
 */

const en = createTranslator('en');
const de = createTranslator('de');

describe('otherEndRole', () => {
	it('reads a generation from the far end: the page is the parent, so the other is the child', () => {
		expect(otherEndRole({ typeKey: 'parent_child', side: 'forward' })).toBe('child');
		expect(otherEndRole({ typeKey: 'parent_child', side: 'reverse' })).toBe('parent');
		expect(otherEndRole({ typeKey: 'grandparent_grandchild', side: 'forward' })).toBe('grandchild');
		expect(otherEndRole({ typeKey: 'aunt_uncle_niece_nephew', side: 'reverse' })).toBe(
			'aunt-uncle'
		);
		expect(otherEndRole({ typeKey: 'mentor_mentee', side: 'forward' })).toBe('mentee');
	});

	it('reads a tie that is the same from both sides the same either way', () => {
		for (const side of ['forward', 'reverse'] as const) {
			expect(otherEndRole({ typeKey: 'spouse', side })).toBe('spouse');
			expect(otherEndRole({ typeKey: 'sibling', side })).toBe('sibling');
			expect(otherEndRole({ typeKey: 'colleague', side })).toBe('colleague');
		}
	});

	it('names no role for a type the household made up', () => {
		expect(otherEndRole({ typeKey: 'godparent_of', side: 'forward' })).toBeNull();
		expect(otherEndRole({ typeKey: '' })).toBeNull();
	});
});

describe('relationshipRoleLabel', () => {
	const daughter = { typeKey: 'parent_child', side: 'forward' as const, label: 'Parent of' };

	it('says the role with the other person’s gender where it is on record', () => {
		expect(relationshipRoleLabel(en, daughter, 'female')).toBe('Daughter');
		expect(relationshipRoleLabel(de, daughter, 'female')).toBe('Tochter');
		expect(relationshipRoleLabel(en, daughter, 'male')).toBe('Son');
		expect(relationshipRoleLabel(en, daughter, 'neutral')).toBe('Child');
	});

	it('borrows the worked-out relatives’ words for the terms they share', () => {
		const grandson = { typeKey: 'grandparent_grandchild', side: 'forward' as const, label: '' };
		expect(relationshipRoleLabel(en, grandson, 'male')).toBe('Grandson');
		expect(relationshipRoleLabel(de, { typeKey: 'sibling', label: '' }, 'female')).toBe(
			'Schwester'
		);
	});

	it('says every built-in tie in both languages', () => {
		const keys = [
			'parent_child',
			'grandparent_grandchild',
			'great_grandparent_great_grandchild',
			'sibling',
			'half_sibling',
			'aunt_uncle_niece_nephew',
			'cousin',
			'parent_in_law_child_in_law',
			'sibling_in_law',
			'partner',
			'spouse',
			'friend',
			'colleague',
			'mentor_mentee',
			'neighbor',
			'acquaintance',
			'knows',
			'other'
		];
		for (const t of [en, de])
			for (const typeKey of keys)
				for (const side of ['forward', 'reverse'] as const)
					for (const variant of ['male', 'female', 'neutral'] as const) {
						const said = relationshipRoleLabel(t, { typeKey, side, label: 'stored' }, variant);
						expect(said).not.toBe('stored');
						expect(said).not.toContain('.');
					}
	});

	it('falls back to the far side’s own words for a household’s type', () => {
		const godchild = { typeKey: 'godparent_of', side: 'forward' as const, label: 'Godparent of' };
		expect(relationshipRoleLabel(en, godchild, 'female', 'Godchild of')).toBe('Godchild of');
		// With nothing better to say, the row's own label is still the truth from the page's side.
		expect(relationshipRoleLabel(en, godchild, 'female')).toBe('Godparent of');
	});
});
