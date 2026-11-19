import type { MarkdownIt } from 'markdown-it';
import { hashtagAt, tagAccent, tagKey } from '../../../hashtags/hashtags';
import { accentChipStyle } from '../../../design/tokens';

/*
 * Tags as chips in a rendered entry (docs/dev/02 §2.20.2). An inline rule rather than a pass over
 * the HTML, so markdown-it has already set aside code, escapes (`\#`) and entities, and a `#`
 * inside a link's text stays text. Which `#word` is a tag is `hashtagAt`'s call, the same one
 * that files the entry under it.
 */

/** What a render needs to make chips: where a tag leads. Absent, a `#` stays text. */
export type TagRenderEnv = {
	tagHref?: (key: string) => string;
};

const escapeHtml = (s: string): string =>
	s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

export function hashtagPlugin(md: MarkdownIt): void {
	md.inline.ruler.after('escape', 'hashtag', (state, silent) => {
		const env = state.env as TagRenderEnv | undefined;
		if (!env?.tagHref || state.linkLevel > 0) return false;
		if (state.src.charCodeAt(state.pos) !== 0x23 /* # */) return false;
		const tag = hashtagAt(state.src, state.pos);
		if (!tag) return false;
		if (!silent) state.push('hashtag', '', 0).content = tag.name;
		state.pos = tag.end;
		return true;
	});

	md.renderer.rules.hashtag = (tokens, idx, _options, env) => {
		const name = tokens[idx].content;
		const href = (env as TagRenderEnv).tagHref!(tagKey(name));
		const style = accentChipStyle(tagAccent(name));
		return `<a class="hashtag" href="${escapeHtml(href)}" style="${style}">#${escapeHtml(name)}</a>`;
	};
}
