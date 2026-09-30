/*
 * A person's gender (docs/02 §2.2): one of three, or nothing on record. Pure and client-safe —
 * the profile's chips, the new-person form and the server all read the same list. Only female
 * and male make relatives' wording gendered; diverse, like nothing, names them neutrally
 * (`src/lib/kinship`).
 */

/** The genders Stella records, in the order the chips show them. */
export const GENDERS = ['female', 'male', 'diverse'] as const;

export type Gender = (typeof GENDERS)[number];

export function isGender(value: unknown): value is Gender {
	return typeof value === 'string' && (GENDERS as readonly string[]).includes(value);
}

/**
 * The gender a stored value stands for. Anything else — free text from before the three, say
 * out of an old archive — reads as not on record, and is replaced the next time it is set.
 */
export function readGender(stored: string | null): Gender | null {
	const normalised = (stored ?? '').trim().toLowerCase();
	return isGender(normalised) ? normalised : null;
}
