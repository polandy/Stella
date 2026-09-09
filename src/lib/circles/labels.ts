import { hasMessage, type Translate } from '$lib/i18n/translate';

/*
 * The kinds a circle can have are a closed vocabulary in the domain (`CIRCLE_KINDS`) but
 * plain text in the database, so they are translated by name with the stored value as the
 * fallback — an older row, or one a future version adds, still reads as itself.
 */

/** What a circle's kind is called in the viewer's language. */
export function circleKindLabel(t: Translate, kind: string): string {
	const key = `circles.kind.${kind}`;
	return hasMessage(key) ? t(key) : kind;
}
