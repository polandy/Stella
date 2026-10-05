// Imported relatively, like `labels.ts`, so the module carries no SvelteKit alias.
import { hasMessage, type Translate } from '../i18n/translate';
import type { KinTerm, KinVariant } from '../kinship/kinship';

/*
 * Who somebody on a person's People card is *to that person* (docs/05 §5.5). A row is read
 * from the page's side — "Parent of" Lena on her father's page — and the card names Lena by
 * what she is to him: his daughter. That is the type's other side, said as a noun, and
 * gendered where the other person's gender is on record, as the worked-out relatives are
 * (docs/02 §2.4.1).
 */

/** The roles a stored tie names that the worked-out relatives do not. */
type TieRole =
	| 'parent'
	| 'child'
	| 'partner'
	| 'spouse'
	| 'friend'
	| 'colleague'
	| 'mentor'
	| 'mentee'
	| 'neighbor'
	| 'acquaintance'
	| 'knows'
	| 'connected';

/** A role the card can say: one of the kinship engine's terms, or a tie's own. */
export type RoleTerm = KinTerm | TieRole;

/**
 * Each built-in type's two ends, as roles: `forward` is who stands at the type's forward end —
 * the parent of `parent_child`. Only the built-in types are here; a household's own type is
 * text somebody typed and has no role to look up.
 */
const ROLES: Readonly<Record<string, { forward: RoleTerm; reverse: RoleTerm }>> = {
	parent_child: { forward: 'parent', reverse: 'child' },
	grandparent_grandchild: { forward: 'grandparent', reverse: 'grandchild' },
	great_grandparent_great_grandchild: { forward: 'great-grandparent', reverse: 'great-grandchild' },
	sibling: { forward: 'sibling', reverse: 'sibling' },
	half_sibling: { forward: 'half-sibling', reverse: 'half-sibling' },
	aunt_uncle_niece_nephew: { forward: 'aunt-uncle', reverse: 'niece-nephew' },
	cousin: { forward: 'cousin', reverse: 'cousin' },
	parent_in_law_child_in_law: { forward: 'parent-in-law', reverse: 'child-in-law' },
	sibling_in_law: { forward: 'sibling-in-law', reverse: 'sibling-in-law' },
	partner: { forward: 'partner', reverse: 'partner' },
	spouse: { forward: 'spouse', reverse: 'spouse' },
	friend: { forward: 'friend', reverse: 'friend' },
	colleague: { forward: 'colleague', reverse: 'colleague' },
	mentor_mentee: { forward: 'mentor', reverse: 'mentee' },
	neighbor: { forward: 'neighbor', reverse: 'neighbor' },
	acquaintance: { forward: 'acquaintance', reverse: 'acquaintance' },
	knows: { forward: 'knows', reverse: 'knows' },
	other: { forward: 'connected', reverse: 'connected' }
};

/** One row of a person's ties, as far as its role needs it. */
interface RoleRow {
	typeKey: string;
	/** Which of the type's labels the row reads from the page's side; forward when unsaid. */
	side?: 'forward' | 'reverse';
}

/**
 * What the person at the row's other end is to the page's person, or null for a household's
 * own type. The page's person reads `side`, so the other end holds the opposite one.
 */
export function otherEndRole(row: RoleRow): RoleTerm | null {
	const ends = Object.hasOwn(ROLES, row.typeKey) ? ROLES[row.typeKey] : null;
	if (!ends) return null;
	return (row.side ?? 'forward') === 'forward' ? ends.reverse : ends.forward;
}

/**
 * The role in the viewer's language. A term the kinship engine also uses is said in its words,
 * so a cousin entered and a cousin worked out read alike; the rest are the ties' own. A
 * household's type has no noun: it reads as the far side's stored label when the caller has it
 * ("Godchild of"), else as the row's own label, which is still true from the page's side.
 */
export function relationshipRoleLabel(
	t: Translate,
	row: RoleRow & { label: string },
	variant: KinVariant,
	otherSideLabel?: string
): string {
	const role = otherEndRole(row);
	if (role === null) return otherSideLabel ?? row.label;
	const kinKey = `kinship.term.${role}.${variant}`;
	if (hasMessage(kinKey)) return t(kinKey);
	const tieKey = `relationships.role.${role}.${variant}`;
	return hasMessage(tieKey) ? t(tieKey) : row.label;
}
