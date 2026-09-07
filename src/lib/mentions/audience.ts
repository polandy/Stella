/*
 * Who a piece of writing is allowed to name (docs/02 §2.20.1). A shared note, entry or moment
 * may reference only people the whole household can see — otherwise the mention would leak a
 * private person's existence; a private one may reference anyone its author can see.
 *
 * Pure and framework-agnostic, and deliberately not under `server/`: the picker in the browser
 * and the resolver on the server narrow by this one function instead of each keeping a copy.
 * The union is spelled out rather than imported so a component can use it without reaching
 * into `$lib/server`; the server's `Visibility` is assignable to it.
 */

/** Audience of the text being written. */
export type MentionAudience = 'shared' | 'private';

/** Narrows people to the ones a text of this audience may name. */
export function allowedForAudience<T extends { visibility: MentionAudience }>(
	people: readonly T[],
	visibility: MentionAudience
): T[] {
	return visibility === 'shared' ? people.filter((p) => p.visibility === 'shared') : [...people];
}
