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
	if (category === 'social' || category === 'professional') return category;
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

/** The worked-out relatives (docs/02 §2.4.1) as one more group on the fold's collapsed line. */
export const WORKED_OUT = 'derived';

/** A group the fold hides whole, and how many people are in it. */
export interface HiddenGroup {
	group: PeopleGroup | typeof WORKED_OUT;
	count: number;
}

export interface FoldedPeople<T> {
	/** The entered people shown, in their groups; a group nobody is left shown in is dropped. */
	groups: PeopleGroupRows<T>[];
	/** How many worked-out relatives are shown: all of them, or none while the card folds. */
	workedOutShown: number;
	/** Everybody folded away, entered or worked out: what *Show N more* counts. */
	hidden: number;
	/** The groups folded away whole, worked-out block last: the fold's collapsed line. */
	hiddenGroups: HiddenGroup[];
}

/**
 * Whether a card of `entered` people and `workedOut` relatives folds. It folds only when that
 * hides two or more — a *Show more* button takes the room of the one person it would hide.
 */
function folds(entered: number, workedOut: number, expanded: boolean): boolean {
	return !expanded && Math.max(0, entered - SHOWN_WHEN_FOLDED) + workedOut >= 2;
}

/**
 * The card as it shows its people (docs/05 §5.5): everybody when `expanded`, else the first
 * `SHOWN_WHEN_FOLDED` entered people in group order. The worked-out relatives take no folded
 * place — the household's own entries come first, and an inference never pushes one of them
 * behind the fold — so a folding card hides them all, and says which groups it hid whole.
 */
export function foldPeople<T>(
	groups: readonly PeopleGroupRows<T>[],
	workedOut: number,
	expanded: boolean
): FoldedPeople<T> {
	const entered = groups.reduce((sum, group) => sum + group.rows.length, 0);
	if (!folds(entered, workedOut, expanded)) {
		return { groups: [...groups], workedOutShown: workedOut, hidden: 0, hiddenGroups: [] };
	}
	let room = SHOWN_WHEN_FOLDED;
	const shown: PeopleGroupRows<T>[] = [];
	const hiddenGroups: HiddenGroup[] = [];
	for (const group of groups) {
		if (room === 0) {
			hiddenGroups.push({ group: group.group, count: group.total });
			continue;
		}
		shown.push({ ...group, rows: group.rows.slice(0, room) });
		room -= Math.min(room, group.rows.length);
	}
	if (workedOut > 0) hiddenGroups.push({ group: WORKED_OUT, count: workedOut });
	return {
		groups: shown,
		workedOutShown: 0,
		hidden: Math.max(0, entered - SHOWN_WHEN_FOLDED) + workedOut,
		hiddenGroups
	};
}

/** How many of the worked-out relatives the card shows — `foldPeople`'s count, without the rows. */
export function workedOutShown(entered: number, workedOut: number, expanded: boolean): number {
	return folds(entered, workedOut, expanded) ? 0 : workedOut;
}
