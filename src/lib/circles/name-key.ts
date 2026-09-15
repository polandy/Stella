/*
 * Which typed circle name means which circle (docs/02 §2.4.2). Joining a circle is one
 * free-text field, so the same question is asked in three places — the repository's lookup,
 * the role suggestions keyed by name, and the field offering them as you type. This is the
 * one spelling of the rule the TypeScript sides share; the repository asks it in SQL
 * (`lower(name) = ?` on a trimmed input) and has to agree with it.
 */

/** The key a typed circle name is matched by: trimmed, case-folded. */
export function circleNameKey(name: string): string {
	return name.trim().toLowerCase();
}
