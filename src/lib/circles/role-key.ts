/*
 * Which circle roles are the same role (docs/02 §2.4.2): trimmed and case-folded, blank meaning
 * none. The members list groups by it, and a circle photo's role (docs/02 §2.14) is matched
 * against those groups by it, so both sides — server and page — fold with this one rule.
 */

/** The key a role is matched by, or null for no role. */
export function roleKey(role: string | null | undefined): string | null {
	const trimmed = (role ?? '').trim();
	return trimmed === '' ? null : trimmed.toLowerCase();
}
