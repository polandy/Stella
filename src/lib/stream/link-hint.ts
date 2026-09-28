/*
 * The post-save "link these two?" hint (docs/02 §2.22.1): the composer hands the first two
 * people of a moment to Home in the URL, so the offer survives the navigation back and a
 * reload. Home's load decides whether to show it — only for people the viewer may see.
 */

/** Query param carrying the hint: `?link=<a>,<b>`. */
export const LINK_PARAM = 'link';

/** Home, offering to link `pair` when there is one. */
export function linkHintHref(pair: readonly [string, string] | null): string {
	return pair ? `/?${LINK_PARAM}=${pair.join(',')}` : '/';
}
