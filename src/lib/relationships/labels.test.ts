import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import { MAX_PARENTS } from './exclusions';
import {
	exclusionLabel,
	relationshipCategoryLabel,
	relationshipRowLabel,
	relationshipStatusLabel,
	relationshipTypeLabel
} from './labels';

/*
 * Which words follow the reader and which do not (docs/02 §2.19): the vocabulary Stella
 * ships with is translated by its key; a type the household typed itself is shown exactly
 * as they wrote it, in either language.
 */

const en = createTranslator('en');
const de = createTranslator('de');

const builtIn = {
	key: 'parent_child',
	forwardLabel: 'Parent of',
	reverseLabel: 'Child of',
	householdId: null
};
const ownType = {
	key: 'godparent_of',
	forwardLabel: 'Godparent of',
	reverseLabel: 'Godchild of',
	householdId: 'h1'
};

describe('relationshipTypeLabel', () => {
	it('translates a type Stella ships with, from either side', () => {
		expect(relationshipTypeLabel(de, builtIn)).toBe('Elternteil von');
		expect(relationshipTypeLabel(de, builtIn, 'reverse')).toBe('Kind von');
		expect(relationshipTypeLabel(en, builtIn)).toBe('Parent of');
	});

	it("leaves a household's own type exactly as it was typed", () => {
		expect(relationshipTypeLabel(de, ownType)).toBe('Godparent of');
		expect(relationshipTypeLabel(de, ownType, 'reverse')).toBe('Godchild of');
	});
});

describe('relationshipRowLabel', () => {
	it('reads the side the row was stored from', () => {
		expect(relationshipRowLabel(de, { typeKey: 'parent_child', side: 'reverse', label: 'Child of' })).toBe(
			'Kind von'
		);
		expect(relationshipRowLabel(de, { typeKey: 'parent_child', label: 'Parent of' })).toBe(
			'Elternteil von'
		);
	});

	it('falls back to the stored label for a type Stella does not own', () => {
		expect(relationshipRowLabel(de, { typeKey: 'godparent_of', label: 'Godparent of' })).toBe(
			'Godparent of'
		);
	});
});

describe('relationshipCategoryLabel and relationshipStatusLabel', () => {
	it('name the closed vocabularies in the reader’s language', () => {
		expect(relationshipCategoryLabel(de, 'family')).toBe('Familie');
		expect(relationshipStatusLabel(de, 'former')).toBe('ehemalig');
		expect(relationshipStatusLabel(de, null)).toBe('Nicht gesagt');
	});

	it('says a value it has no word for rather than nothing', () => {
		expect(relationshipCategoryLabel(en, 'invented')).toBe('invented');
		expect(relationshipStatusLabel(en, 'invented')).toBe('invented');
	});
});

describe('exclusionLabel', () => {
	const carl = () => 'Carl';

	const named = (id: string) => ({ bert: 'Bert Weber', dora: 'Dora', c: 'Carl' })[id] ?? id;

	/*
	 * Both people are named. "already with Dora" on Nora's page reads as though Nora were
	 * the one spoken for, when it is Bert — the entry has to say whose partnership is in the
	 * way, exactly as the parent rule names the child who already has two.
	 */
	it('says who is spoken for, and with whom', () => {
		const taken = { reason: 'romanticTaken', personId: 'bert', partnerId: 'dora' } as const;
		expect(exclusionLabel(en, taken, named)).toBe('Bert Weber is already with Dora');
		expect(exclusionLabel(de, taken, named)).toBe('Bert Weber ist schon mit Dora zusammen');
	});

	/*
	 * The link in the way is named, and named from the subject's side. Without it every
	 * family and romantic entry read "already linked to Bert Weber", which a reader takes
	 * as a claim about the entry that is greyed out rather than about the link that blocks it.
	 */
	it('names the link that is in the way, translated where Stella owns the type', () => {
		const godchild = {
			reason: 'alreadyRomantic',
			personId: 'c',
			tie: { typeKey: 'parent_child', side: 'reverse', label: 'Child of' }
		} as const;
		expect(exclusionLabel(en, godchild, carl)).toBe('already Child of Carl');
		expect(exclusionLabel(de, godchild, carl)).toBe('schon Kind von Carl');
	});

	it('shows a household’s own type exactly as it was typed', () => {
		const godchild = {
			reason: 'alreadyRomantic',
			personId: 'c',
			tie: { typeKey: 'godparent_of', side: 'reverse', label: 'Godchild of' }
		} as const;
		expect(exclusionLabel(en, godchild, carl)).toBe('already Godchild of Carl');
		expect(exclusionLabel(de, godchild, carl)).toBe('schon Godchild of Carl');
	});

	it('still says something when the link is not named', () => {
		expect(exclusionLabel(en, { reason: 'alreadyRomantic', personId: 'c' }, carl)).toBe(
			'already with Carl'
		);
	});

	it('names the count where the rule is a count', () => {
		expect(exclusionLabel(en, { reason: 'parentsComplete', personId: 'c' }, carl)).toBe(
			`Carl already has ${MAX_PARENTS} parents`
		);
	});

	it('needs no name where the reason is about neither person alone', () => {
		expect(exclusionLabel(en, { reason: 'siblingDerived', personId: 'c' }, carl)).toBe(
			'already siblings through their parents'
		);
	});
});
