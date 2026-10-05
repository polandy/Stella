import type { RoleTerm } from './roles';

/*
 * How a person's People card lists their ties (docs/05 §5.5): grouped by the kind of tie the
 * household chose when it entered them — the type's category, nothing worked out — family
 * first, and folded to a handful once there are enough of them to push the photos a screen
 * further down.
 */

/** The card's groups, in the order it shows them. */
export const PEOPLE_GROUPS = ['family', 'social', 'professional', 'other'] as const;
export type PeopleGroup = (typeof PEOPLE_GROUPS)[number];

/**
 * Which group a tie of this category is listed under. A partner or spouse is family: the
 * categories keep romance apart for the map's colours, but a group holding one person would
 * spend a heading on them, and nobody looks for their partner anywhere but with the family.
 */
export function peopleGroupOf(category: string): PeopleGroup {
	if (category === 'romantic' || category === 'family') return 'family';
	if (category === 'social') return category;
	return 'other';
}

/**
 * Within a group, the closer tie first: partner, then parents, children and siblings, then the
 * wider family. A role not ranked here — a household's own type among them — keeps the order it
 * came in, after the ranked ones.
 */
const ROLE_ORDER: readonly RoleTerm[] = [
	'spouse',
	'partner',
	'parent',
	'step-parent',
	'child',
	'step-child',
	'sibling',
	'half-sibling',
	'step-sibling',
	'grandparent',
	'grandchild',
	'great-grandparent',
	'great-grandchild',
	'aunt-uncle',
	'niece-nephew',
	'cousin',
	'parent-in-law',
	'child-in-law',
	'sibling-in-law'
];
const rankOf = (role: RoleTerm | null) => {
	const at = role === null ? -1 : ROLE_ORDER.indexOf(role);
	return at === -1 ? ROLE_ORDER.length : at;
};

/** What a row needs to be grouped: its tie's category and the far end's role. */
interface Groupable {
	category: string;
	role: RoleTerm | null;
	/** `former` lists the tie after the current ones of its group. */
	status?: string;
}

export interface PeopleGroupRows<T> {
	group: PeopleGroup;
	rows: T[];
	/** Everybody in the group, folded away or not: what its heading counts. */
	total: number;
}

/** The ties in their groups, groups nobody is in left out. */
export function groupPeople<T extends Groupable>(rows: readonly T[]): PeopleGroupRows<T>[] {
	const ordered = rows
		.map((row, index) => ({ row, index }))
		.sort(
			(a, b) =>
				Number(a.row.status === 'former') - Number(b.row.status === 'former') ||
				rankOf(a.row.role) - rankOf(b.row.role) ||
				a.index - b.index
		)
		.map(({ row }) => row);
	return PEOPLE_GROUPS.map((group) => {
		const inGroup = ordered.filter((row) => peopleGroupOf(row.category) === group);
		return { group, rows: inGroup, total: inGroup.length };
	}).filter((group) => group.total > 0);
}

/** How many people a folded card shows (two rows of three, three of two on a phone). */
export const SHOWN_WHEN_FOLDED = 6;

/**
 * The groups as the card shows them: everybody when `expanded`, else the first
 * `SHOWN_WHEN_FOLDED` in group order and how many are folded away. A card folds only when that
 * hides two or more — a *Show all* button takes the room of the one person it would hide.
 */
export function foldPeople<T>(
	groups: readonly PeopleGroupRows<T>[],
	expanded: boolean
): { groups: PeopleGroupRows<T>[]; hidden: number } {
	const everybody = groups.reduce((sum, group) => sum + group.rows.length, 0);
	const hidden = hiddenWhenFolded(everybody, expanded);
	if (hidden === 0) return { groups: [...groups], hidden };
	let room = SHOWN_WHEN_FOLDED;
	const shown: PeopleGroupRows<T>[] = [];
	for (const group of groups) {
		if (room === 0) break;
		shown.push({ ...group, rows: group.rows.slice(0, room) });
		room -= Math.min(room, group.rows.length);
	}
	return { groups: shown, hidden };
}

/** How many of `count` entered ties a card folds away — `foldPeople`'s count, without the rows. */
export function hiddenWhenFolded(count: number, expanded: boolean): number {
	return expanded || count - SHOWN_WHEN_FOLDED < 2 ? 0 : count - SHOWN_WHEN_FOLDED;
}

/** How many worked-out relatives a folded card shows: one row of two on a phone. */
const DERIVED_WHEN_FOLDED = 2;

/**
 * How many of the worked-out relatives (docs/02 §2.4.1) the card shows. They fold with the
 * card's own *Show more*: a family's in-laws and cousins otherwise outnumber the people entered.
 * Like the entered ones, they fold only when that hides two or more.
 */
export function derivedShownWhenFolded(count: number, expanded: boolean): number {
	if (expanded || count - DERIVED_WHEN_FOLDED < 2) return count;
	return DERIVED_WHEN_FOLDED;
}
