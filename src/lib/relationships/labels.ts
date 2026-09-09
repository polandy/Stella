import { hasMessage, type Translate } from '$lib/i18n/translate';

/*
 * How a relationship reads in the viewer's language (docs/02 §2.19). The types Stella ships
 * with have stable keys, so their labels are translated; a household's own types are text
 * somebody typed and are shown exactly as they wrote them.
 */

/** What a relationship type needs to carry to be named. */
export interface NameableType {
	key: string;
	forwardLabel: string;
	reverseLabel: string;
	/** Null for the built-in, global types. */
	householdId?: string | null;
}

/** The label of one side of a type: the translation when Stella owns it, the stored text otherwise. */
export function relationshipTypeLabel(
	t: Translate,
	type: NameableType,
	side: 'forward' | 'reverse' = 'forward'
): string {
	const stored = side === 'forward' ? type.forwardLabel : type.reverseLabel;
	const key = `relationships.type.${type.key}.${side}`;
	return hasMessage(key) ? t(key) : stored;
}

/** What a relationship category is called. */
export function relationshipCategoryLabel(t: Translate, category: string): string {
	const key = `relationships.category.${category}`;
	return hasMessage(key) ? t(key) : category;
}

/** Whether a tie still holds: *current*, *former*, or nothing said. */
export function relationshipStatusLabel(t: Translate, status: string | null): string {
	if (status === null) return t('relationships.status.notSaid');
	const key = `relationships.status.${status}`;
	return hasMessage(key) ? t(key) : status;
}
