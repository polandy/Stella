/*
 * Derive a contact's display name — pure (docs/03 §contact: display_name is required and
 * never empty). Priority: explicit name → first+last → first → last → nickname.
 */

export interface NameParts {
	displayName?: string | null;
	firstName?: string | null;
	lastName?: string | null;
	nickname?: string | null;
}

const clean = (value?: string | null): string => (value ?? '').trim();

export function deriveDisplayName(parts: NameParts): string {
	const explicit = clean(parts.displayName);
	if (explicit) return explicit;

	const fullName = [clean(parts.firstName), clean(parts.lastName)].filter(Boolean).join(' ');
	if (fullName) return fullName;

	const nickname = clean(parts.nickname);
	if (nickname) return nickname;

	throw new Error('A contact needs at least a name or nickname.');
}
