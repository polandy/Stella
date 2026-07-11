/*
 * Avatar fallback helpers (docs/05 §5.10): when a contact has no photo, show their initials on
 * a colour deterministically derived from their id, so the same person always gets the same
 * accent across the list, profile, and graph. Pure and framework-free.
 */

const ACCENTS = [
	'mauve', 'blue', 'green', 'peach', 'pink', 'teal', 'sky', 'yellow', 'maroon', 'rosewater',
	'sapphire', 'lavender', 'flamingo'
] as const;

export type AvatarAccent = (typeof ACCENTS)[number];

/** Up to two uppercase initials from a display name; '?' when there's nothing usable. */
export function initials(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return '?';
	if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
	return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** A stable Catppuccin accent name for a contact id. */
export function avatarAccent(id: string): AvatarAccent {
	let hash = 0;
	for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
	return ACCENTS[hash % ACCENTS.length];
}
