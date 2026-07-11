import { describe, expect, it } from 'bun:test';
import { renderMarkdown } from './markdown';

/*
 * Server-side Markdown rendering for notes (docs/02 §2.5). Configured so raw HTML is
 * escaped and unsafe link protocols are dropped — no separate sanitizer dependency needed.
 */

describe('renderMarkdown', () => {
	it('renders basic Markdown', () => {
		expect(renderMarkdown('**bold**')).toContain('<strong>bold</strong>');
	});

	it('escapes raw HTML instead of emitting it', () => {
		const out = renderMarkdown('<script>alert(1)</script>');
		expect(out).not.toContain('<script>');
		expect(out).toContain('&lt;script&gt;');
	});

	it('never emits an executable javascript: link', () => {
		const out = renderMarkdown('[click](javascript:alert(1))');
		expect(out.toLowerCase()).not.toContain('href="javascript');
	});

	it('linkifies bare URLs', () => {
		expect(renderMarkdown('see https://example.test')).toContain('href="https://example.test"');
	});
});
