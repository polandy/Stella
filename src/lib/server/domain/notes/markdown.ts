import MarkdownIt from 'markdown-it';

/*
 * Note Markdown rendering (docs/02 §2.5). `html: false` escapes any raw HTML in the source
 * (so a pasted <script> is inert), and markdown-it's default link validation drops unsafe
 * protocols (javascript:, etc.). This keeps rendering safe without an extra sanitizer dep.
 * Server-only: the rendered HTML is passed to the client already-safe.
 */

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

export function renderMarkdown(source: string): string {
	return md.render(source);
}
