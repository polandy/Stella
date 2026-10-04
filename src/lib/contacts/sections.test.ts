import { describe, expect, test } from 'bun:test';
import {
	CONTACT_SECTIONS,
	addRelationshipPath,
	contactSectionPath,
	SECTION_FOR_LEGACY_TAB,
	SECTION_FOR_REFERENCE,
	sectionAnchor,
	sectionForLegacyTab
} from './sections';

/* The card vocabulary a link may name (docs/05 §5.5, docs/02 §2.20.1). */

describe('CONTACT_SECTIONS', () => {
	test('lists the cards in the order the page stacks them: relationships, then photos', () => {
		expect([...CONTACT_SECTIONS]).toEqual(['relationships', 'photos', 'story', 'notes', 'mentions']);
	});
});

describe('sectionAnchor', () => {
	test('prefixes the id, so it cannot collide with an id the page uses for something else', () => {
		expect(sectionAnchor('notes')).toBe('section-notes');
	});
});

describe('contactSectionPath', () => {
	test('points at the card on that person’s page', () => {
		expect(contactSectionPath('c-1', 'photos')).toBe('/contacts/c-1#section-photos');
	});
});

describe('addRelationshipPath', () => {
	test('opens the relationship form on that person’s page, with nobody picked yet', () => {
		const url = new URL(addRelationshipPath('c-1'), 'http://stella.test');

		expect(url.pathname).toBe('/contacts/c-1');
		// The page opens its form for any `relate`, and names the other end only when it is set.
		expect(url.searchParams.get('relate')).toBe('');
		expect(url.hash).toBe('#section-relationships');
	});
});

describe('SECTION_FOR_REFERENCE', () => {
	test('sends each kind of reference to the card its entry is read on', () => {
		expect(SECTION_FOR_REFERENCE.note).toBe('notes');
		expect(SECTION_FOR_REFERENCE.journal).toBe('story');
	});

	test('names only cards the page actually has, since a typo here is a dead link', () => {
		for (const section of Object.values(SECTION_FOR_REFERENCE)) {
			expect(CONTACT_SECTIONS).toContain(section);
		}
	});
});

describe('sectionForLegacyTab', () => {
	test('answers a bookmark from when the page had tabs', () => {
		expect(sectionForLegacyTab('people')).toBe('relationships');
		expect(sectionForLegacyTab('story')).toBe('story');
	});

	test('carries every tab the page ever had, so no old link is dropped', () => {
		// The tabs as they were named in `contacts/tabs.ts` before the cards replaced them.
		for (const tab of ['people', 'story', 'notes', 'photos', 'mentions']) {
			expect(sectionForLegacyTab(tab)).not.toBeNull();
		}
	});

	test('names only cards the page actually has', () => {
		for (const section of Object.values(SECTION_FOR_LEGACY_TAB)) {
			expect(CONTACT_SECTIONS).toContain(section);
		}
	});

	test('answers none for a value that names no tab, so a hand-typed URL cannot break the page', () => {
		expect(sectionForLegacyTab('everything')).toBeNull();
		expect(sectionForLegacyTab(null)).toBeNull();
	});

	test('answers none for a property every object inherits', () => {
		expect(sectionForLegacyTab('constructor')).toBeNull();
		expect(sectionForLegacyTab('toString')).toBeNull();
	});
});
