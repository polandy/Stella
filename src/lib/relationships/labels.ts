// Imported relatively rather than through `$lib`: the domain words its refusals with
// `exclusionLabel`, and domain code carries no SvelteKit alias in its path (docs/08 §8.3).
import { hasMessage, type Translate } from '../i18n/translate';
import { MAX_PARENTS, type Exclusion } from './exclusions';

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

/** One row of a person's relationships, as the reads hand it over. */
export interface LabelledRelationship {
	/** The type's machine key; empty for a row that does not carry one. */
	typeKey: string;
	/** Which of the type's two labels this row reads; forward when it does not say. */
	side?: 'forward' | 'reverse';
	/** The label as stored, and the fallback for a household's own type. */
	label: string;
}

/**
 * How one relationship row reads: a type Stella ships with is translated by its key, a
 * household's own type is shown exactly as somebody typed it.
 */
export function relationshipRowLabel(t: Translate, row: LabelledRelationship): string {
	const key = `relationships.type.${row.typeKey}.${row.side ?? 'forward'}`;
	return hasMessage(key) ? t(key) : row.label;
}

/** What a relationship category is called. */
export function relationshipCategoryLabel(t: Translate, category: string): string {
	const key = `relationships.category.${category}`;
	return hasMessage(key) ? t(key) : category;
}

/**
 * Why an entry of the picker cannot be chosen (docs/02 §2.4), in the few words that fit
 * beside the label — `nameOf` resolves the person the reason is about. The sentence saying
 * what to do instead is the refusal at the write (`errors.relationship.*`).
 */
export function exclusionLabel(
	t: Translate,
	exclusion: Exclusion,
	nameOf: (contactId: string) => string
): string {
	const name = nameOf(exclusion.personId);
	switch (exclusion.reason) {
		case 'alreadyRomantic':
			// Naming the link is the whole point of the reason; "linked to" is the fallback for
			// a refusal that reaches here without one rather than a wording anybody should see.
			return exclusion.tie
				? t('relationships.blocked.alreadyTied', {
						tie: relationshipRowLabel(t, exclusion.tie),
						name
					})
				: t('relationships.blocked.alreadyRomantic', { name });
		case 'siblingDerived':
			return t('relationships.blocked.siblingDerived');
		case 'romanticTaken':
			return t('relationships.blocked.romanticTaken', {
				name,
				partner: exclusion.partnerId ? nameOf(exclusion.partnerId) : ''
			});
		case 'parentsComplete':
			return t('relationships.blocked.parentsComplete', { name, max: MAX_PARENTS });
	}
}

/** Whether a tie still holds: *current* or *former* — there is no third answer. */
export function relationshipStatusLabel(t: Translate, status: string): string {
	const key = `relationships.status.${status}`;
	return hasMessage(key) ? t(key) : status;
}
