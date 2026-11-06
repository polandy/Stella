import { describe, expect, it } from 'bun:test';
import MarkdownIt from 'markdown-it';
import { hashtagPlugin, type TagRenderEnv } from './markdown-hashtags';

/*
 * Tags as chips in a rendered entry (docs/02 §2.20.2), on a bare markdown-it so only the rule is
 * under test. Which `#word` is a tag is `hashtagAt`'s call; this pins where a chip may appear
 * and that nothing a member typed reaches the HTML unescaped.
 */

const md = new MarkdownIt({ linkify: true }).use(hashtagPlugin);
const env: TagRenderEnv = { tagHref: (key) => `/journal?tag=${key}` };
const render = (text: string, renderEnv: TagRenderEnv = env) => md.renderInline(text, renderEnv);

describe('hashtagPlugin', () => {
	it('renders a tag as a chip leading to its key', () => {
		const out = render('a #Hike today');
		expect(out).toContain('<a class="hashtag" href="/journal?tag=hike"');
		expect(out).toContain('>#Hike</a> today');
	});

	it('leaves a # as text when the render has nowhere for a tag to lead', () => {
		expect(render('a #Hike', {})).toBe('a #Hike');
		expect(md.renderInline('a #Hike')).toBe('a #Hike');
	});

	it('leaves a # as text inside a link, a code span or after a backslash', () => {
		expect(render('[see #Hike](https://example.org)')).not.toContain('hashtag');
		expect(render('`#Hike`')).toBe('<code>#Hike</code>');
		expect(render('\\#Hike')).toBe('#Hike');
	});

	it('escapes what the href holds', () => {
		const out = render('#Hike', { tagHref: () => '/x?a="b"&c<d>' });
		expect(out).toContain('href="/x?a=&quot;b&quot;&amp;c&lt;d&gt;"');
	});
});
