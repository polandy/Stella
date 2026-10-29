import MarkdownIt from 'markdown-it';
import { MENTION_TOKEN_RE } from '../../../mentions/mentions';
import { hashtagPlugin, type TagRenderEnv } from './markdown-hashtags';

/*
 * Note Markdown rendering (docs/02 §2.5). `html: false` escapes any raw HTML in the source
 * (so a pasted <script> is inert), and markdown-it's default link validation drops unsafe
 * protocols (javascript:, etc.). This keeps rendering safe without an extra sanitizer dep.
 * Server-only: the rendered HTML is passed to the client already-safe.
 */

const md = new MarkdownIt({ html: false, linkify: true, breaks: true }).use(hashtagPlugin);

export function renderMarkdown(source: string, env: TagRenderEnv = {}): string {
	return md.render(source, env);
}

const escapeHtml = (s: string): string =>
	s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/**
 * Render a body that may contain @-mention tokens (docs/02 §2.20.1). Markdown is rendered first;
 * the id-based tokens survive it verbatim (no special Markdown chars) and are then turned into
 * chip links. `nameOf` returns the referenced person's current display name, scoped to what the
 * viewer may see — an unknown/hidden id renders as a neutral, non-linked marker so nothing leaks.
 * A journal entry passes `tags` so its `#words` become chips too (docs/02 §2.20.2).
 */
export function renderMarkdownWithMentions(
	source: string,
	nameOf: (id: string) => string | null,
	tags: TagRenderEnv = {}
): string {
	const html = renderMarkdown(source, { ...tags });
	return html.replace(new RegExp(MENTION_TOKEN_RE.source, 'g'), (_match, id: string) => {
		const name = nameOf(id);
		if (!name) return '<span class="mention mention-unknown">@unknown</span>';
		return `<a class="mention" href="/contacts/${id}">@${escapeHtml(name)}</a>`;
	});
}
