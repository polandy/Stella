import { describe, expect, test } from 'bun:test';
import { CONTACT_TABS, requestedTab, TAB_FOR_REFERENCE } from './tabs';

/* The tab vocabulary a link may name (docs/05 §5.5, docs/02 §2.20.1). */

describe('requestedTab', () => {
	test('names a tab the page has', () => {
		expect(requestedTab('notes')).toBe('notes');
	});

	test('names none for a value that is not a tab, so a hand-typed URL cannot break the page', () => {
		expect(requestedTab('everything')).toBe(null);
		expect(requestedTab(null)).toBe(null);
	});
});

describe('TAB_FOR_REFERENCE', () => {
	test('sends each kind of reference to the tab its entry is read on', () => {
		expect(TAB_FOR_REFERENCE.note).toBe('notes');
		expect(TAB_FOR_REFERENCE.journal).toBe('story');
		// Both are tabs the page actually has; a typo here would be a dead link.
		expect(CONTACT_TABS).toContain(TAB_FOR_REFERENCE.note);
		expect(CONTACT_TABS).toContain(TAB_FOR_REFERENCE.journal);
	});
});
