import { describe, expect, test } from 'bun:test';
import { matchSnippet, mentionSnippet, SNIPPET_LENGTH } from './snippet';

/* The one-line preview a passive reference shows (docs/02 §2.20.1). */

const names = (id: string) => (id === 'c-sandra' ? 'Sandra Brunner' : null);

describe('mentionSnippet', () => {
	test('leaves a short plain body as it is', () => {
		expect(mentionSnippet('Hiked up the Niesen.', names)).toBe('Hiked up the Niesen.');
	});

	test('reads a mention as the person’s current name, not as the stored token', () => {
		expect(mentionSnippet('hiked with @{contact:c-sandra} today', names)).toBe(
			'hiked with @Sandra Brunner today'
		);
	});

	test('names someone the viewer may not see as unknown, the same as the chip does', () => {
		expect(mentionSnippet('met @{contact:c-hidden} there', names)).toBe('met @unknown there');
	});

	test('drops Markdown marks but keeps the words, and a link keeps its text', () => {
		expect(mentionSnippet('## **Great** day at [the lake](https://example.com)', names)).toBe(
			'Great day at the lake'
		);
	});

	test('drops an image outright — a preview has no room for it', () => {
		expect(mentionSnippet('Look: ![the summit](/media/a.jpg) lovely', names)).toBe('Look: lovely');
	});

	test('collapses a multi-line body onto one line', () => {
		expect(mentionSnippet('First line\n\nSecond   line', names)).toBe('First line Second line');
	});

	test('cuts a long body at a word boundary and says it was cut', () => {
		const body = 'word '.repeat(60).trim();
		const snippet = mentionSnippet(body, names);

		expect(snippet.length).toBeLessThanOrEqual(SNIPPET_LENGTH + 1);
		expect(snippet.endsWith('…')).toBe(true);
		expect(snippet).not.toContain('wor…');
	});

	test('keeps a body that is exactly at the limit whole', () => {
		const body = 'x'.repeat(SNIPPET_LENGTH);
		expect(mentionSnippet(body, names)).toBe(body);
	});
});

describe('matchSnippet', () => {
	const rosa = (id: string) => (id === 'c-rosa' ? 'Rosa Brunner' : null);

	test('keeps the person a search found, named as the chip names them', () => {
		expect(matchSnippet('Choir concert in the Münster with @{contact:c-rosa}.', rosa, 'rosa')).toBe(
			'Choir concert in the Münster with @Rosa Brunner.'
		);
	});

	test('names a hidden person as unknown, never by the stored token', () => {
		expect(matchSnippet('Met @{contact:c-hidden} at the lake', rosa, 'lake')).toBe(
			'Met @unknown at the lake'
		);
	});

	test('cuts a long body around the match, and says what was cut on both sides', () => {
		const body = `${'before '.repeat(40)}the lighthouse ${'after '.repeat(40)}`.trim();
		const snippet = matchSnippet(body, rosa, 'lighthouse');
		expect(snippet.startsWith('…')).toBe(true);
		expect(snippet.endsWith('…')).toBe(true);
		expect(snippet).toContain('the lighthouse');
		expect(snippet.length).toBeLessThanOrEqual(SNIPPET_LENGTH + 2);
	});

	test('finds a word by its start and without its accents, as the index does', () => {
		const body = `${'filler '.repeat(40)}sang in the Münster`;
		expect(matchSnippet(body, rosa, 'munst')).toContain('Münster');
	});

	test('shows the start of the body when the words matched only elsewhere (a title)', () => {
		const body = 'word '.repeat(60).trim();
		expect(matchSnippet(body, rosa, 'nowhere')).toBe(mentionSnippet(body, rosa));
	});
});
