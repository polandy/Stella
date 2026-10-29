import { describe, expect, it } from 'bun:test';
import { renderMarkdown, renderMarkdownWithMentions } from './markdown';

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

/*
 * The chip half of the same renderer (docs/02 §2.20.1): a stored token becomes a link
 * labelled with the person's *current* name, and an id the viewer may not see becomes a
 * neutral marker rather than a name. `nameOf` is the visibility scope, so the marker case is
 * the one that keeps a private person's existence out of a body someone else can read.
 */
describe('renderMarkdownWithMentions', () => {
	const names: Record<string, string> = {
		'c-anna': 'Anna Weber',
		// An imported contact keeps its Monica source id, colons and all (docs/02 §2.16).
		'monica:contact:9': 'Janosch Rohdewald'
	};
	const nameOf = (id: string) => names[id] ?? null;

	it('renders a mention as a chip linking to the person', () => {
		const out = renderMarkdownWithMentions('hiked with @{contact:c-anna}', nameOf);
		expect(out).toContain('<a class="mention" href="/contacts/c-anna">@Anna Weber</a>');
	});

	it('renders a mention of an imported contact, whose id contains colons', () => {
		const out = renderMarkdownWithMentions(
			'@{contact:monica:contact:9} versucht anzurufen',
			nameOf
		);
		expect(out).toContain('href="/contacts/monica:contact:9"');
		expect(out).toContain('@Janosch Rohdewald');
		// The bug this guards: the token reaching the screen as its own raw text.
		expect(out).not.toContain('@{contact:');
	});

	it('renders an id the viewer may not see as a neutral marker, never a name or a link', () => {
		const out = renderMarkdownWithMentions('met @{contact:c-secret} there', nameOf);
		expect(out).toContain('mention-unknown');
		expect(out).not.toContain('href="/contacts/c-secret"');
		// Positive control: the same call does link the person this viewer may see.
		expect(renderMarkdownWithMentions('met @{contact:c-anna}', nameOf)).toContain(
			'href="/contacts/c-anna"'
		);
	});

	it('escapes a display name rather than letting it become markup', () => {
		const out = renderMarkdownWithMentions('@{contact:c-x}', (id) =>
			id === 'c-x' ? '<img src=x onerror=1>' : null
		);
		expect(out).not.toContain('<img');
		expect(out).toContain('&lt;img');
	});
});

/*
 * The tag half (docs/02 §2.20.2): a `#word` the parser reads as a tag becomes a chip linking to
 * the journal filtered by it — the same words `hashtagsIn` stores, so what shows as a chip is
 * what the entry is filed under. Only a caller that says where a tag leads gets chips; a note
 * keeps its `#` as text.
 */
describe('renderMarkdownWithMentions with tags', () => {
	const nameOf = () => null;
	const tagHref = (key: string) => `/contacts/c-anna/journal?tag=${encodeURIComponent(key)}`;

	it('renders a tag as a chip in the spelling written, linking by its key', () => {
		const out = renderMarkdownWithMentions('a long #Hike today', nameOf, { tagHref });
		expect(out).toContain('href="/contacts/c-anna/journal?tag=hike"');
		expect(out).toContain('>#Hike</a>');
		expect(out).toContain('class="hashtag"');
		expect(out).toContain('style="background:color-mix(');
	});

	it('keeps an umlaut tag whole, its key encoded in the link', () => {
		const out = renderMarkdownWithMentions('#Ausflug-Zürich', nameOf, { tagHref });
		expect(out).toContain(`?tag=${encodeURIComponent('ausflug-zürich')}"`);
		expect(out).toContain('>#Ausflug-Zürich</a>');
	});

	it('leaves what the parser does not read as a tag as text', () => {
		for (const text of ['mail#x', '\\#notatag', '`#code`', '#2024', 'see [#x](https://a.test)']) {
			expect(renderMarkdownWithMentions(text, nameOf, { tagHref })).not.toContain('hashtag');
		}
	});

	it('does not touch a heading', () => {
		expect(renderMarkdownWithMentions('# Title', nameOf, { tagHref })).toContain('<h1>Title</h1>');
	});

	it('renders no chip for a caller without tags, such as a note', () => {
		expect(renderMarkdownWithMentions('a #Hike', nameOf)).not.toContain('hashtag');
	});
});
