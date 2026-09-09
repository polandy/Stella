import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import {
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
