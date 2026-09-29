/*
 * Turning what someone typed into a person picker into the start of a new person (docs/02
 * §2.2.2): when the search finds no one, the query itself is already the name. Pure and
 * client-safe — the picker pre-fills its create form without a round trip.
 */

/** First and last name as read out of a search query; either may be empty. */
export interface TypedName {
	firstName: string;
	lastName: string;
}

/** Below this, the query is still mid-typing and offering to create from it would be noise. */
const MIN_CREATABLE_LENGTH = 2;

/**
 * Split a typed query into a first and last name: the first word names the person, everything
 * after it is the surname, so `van der Berg` stays one surname rather than three names.
 */
export function splitTypedName(query: string): TypedName {
	const words = query.trim().split(/\s+/).filter(Boolean);
	return { firstName: words[0] ?? '', lastName: words.slice(1).join(' ') };
}

/** Whether a query has enough in it to offer creating a person from it. */
export function isNameWorthCreating(query: string): boolean {
	return query.trim().length >= MIN_CREATABLE_LENGTH;
}

/**
 * Whether to ask for a line to know the new person by (docs/02 §2.2.3): a first name alone
 * will not tell them apart from the next person of that name. Only a nudge — saving without
 * one stays allowed, a name is all a person needs.
 */
export function wantsSomethingToKnowThemBy(name: TypedName): boolean {
	return name.firstName.trim() !== '' && name.lastName.trim() === '';
}

/**
 * A name typed all in lowercase with its first letter capitalised — `@thomas` is how a handle
 * is typed on a phone, not how the person is called. Any capital already in it is the writer's
 * own choice and is kept as it is.
 */
export function capitalisedIfTypedLowercase(name: string): string {
	if (name !== name.toLowerCase()) return name;
	return name.charAt(0).toUpperCase() + name.slice(1);
}
