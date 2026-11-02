/*
 * A person's brief (docs/02 §2.2.5): one compact view for "we're going over in ten minutes" —
 * everything worth knowing at a glance, nothing to fill in. Pure, so who counts as their family,
 * which blocks stand and in what order is decided and tested here, not in markup. Every row is
 * handed in already read through the access layer; nothing here widens what a reader may see.
 */

import type { KinTerm, KinVariant } from '../kinship/kinship';
import { otherEndRole, type RoleTerm } from '../relationships/roles';
import { FORMER_RELATIONSHIP_STATUS } from '../relationships/status';
import { ageOn } from './identity-card';

/** How many of the latest moments and touchpoints the brief shows. */
export const LATELY_COUNT = 3;

/** A stored tie of the person's, read from their side, as far as the brief needs it. */
export interface BriefTie {
	otherContactId: string;
	otherDisplayName: string;
	typeKey: string;
	side: 'forward' | 'reverse';
	status: string;
}

/** A relative the kinship engine worked out (docs/02 §2.4.1). */
export interface BriefKin {
	personId: string;
	displayName: string;
	term: KinTerm;
	variant: KinVariant;
}

/** A birthday among the household's dates: an entered one, or one read off the profile. */
export interface BirthdaySource {
	contactId: string;
	kind: string;
	date: string;
	/** True for the profile's birth date, which an entered birthday overrides (docs/02 §2.13). */
	derived: boolean;
	isDeceased: boolean;
}

/** Who belongs to the person, closest first: the couple, then the children. */
export type FamilyRole = 'spouse' | 'partner' | 'child' | 'step-child';

const ROLE_RANK: Record<FamilyRole, number> = { spouse: 0, partner: 1, child: 2, 'step-child': 2 };
const isFamilyRole = (role: RoleTerm | null): role is FamilyRole =>
	role !== null && Object.hasOwn(ROLE_RANK, role);

export interface FamilyMember {
	id: string;
	name: string;
	role: FamilyRole;
	variant: KinVariant;
	/** Whole years today; null without a known birth year, or once they have died. */
	age: number | null;
	deceased: boolean;
}

/**
 * The partner and the children, with their ages (docs/02 §2.2.5). Stored ties name them; the
 * kinship engine adds a stepchild nobody entered. An ended partnership is not the family one
 * visits, and somebody tied twice — partner and spouse — is named once, by the closer word.
 */
export function closeFamily(
	input: {
		ties: readonly BriefTie[];
		tieWording: Readonly<Record<string, KinVariant>>;
		derivedKin: readonly BriefKin[];
		birthdays: readonly BirthdaySource[];
	},
	today: string
): FamilyMember[] {
	const named = new Map<string, Omit<FamilyMember, 'age' | 'deceased'>>();
	const add = (member: Omit<FamilyMember, 'age' | 'deceased'>) => {
		const known = named.get(member.id);
		if (!known || ROLE_RANK[member.role] < ROLE_RANK[known.role]) named.set(member.id, member);
	};
	for (const tie of input.ties) {
		const role = otherEndRole(tie);
		if (!isFamilyRole(role) || tie.status === FORMER_RELATIONSHIP_STATUS) continue;
		add({
			id: tie.otherContactId,
			name: tie.otherDisplayName,
			role,
			variant: input.tieWording[tie.otherContactId] ?? 'neutral'
		});
	}
	for (const kin of input.derivedKin) {
		if (kin.term !== 'step-child') continue;
		add({ id: kin.personId, name: kin.displayName, role: kin.term, variant: kin.variant });
	}

	const members = [...named.values()].map((member): FamilyMember => {
		const birth = birthdayOf(input.birthdays, member.id);
		const deceased = birth?.isDeceased ?? false;
		return { ...member, age: birth && !deceased ? ageOn(birth.date, today) : null, deceased };
	});
	return members.sort(
		(a, b) =>
			ROLE_RANK[a.role] - ROLE_RANK[b.role] ||
			// Oldest first; an unknown age after every known one.
			(b.age ?? -1) - (a.age ?? -1) ||
			a.name.localeCompare(b.name)
	);
}

/** An entered birthday wins over the profile's, as everywhere else (docs/02 §2.13). */
function birthdayOf(sources: readonly BirthdaySource[], contactId: string) {
	const theirs = sources.filter((s) => s.contactId === contactId && s.kind === 'birthday');
	return theirs.find((s) => !s.derived) ?? theirs[0] ?? null;
}

/** The nearest date ahead of the person or their family; `ahead` is nearest first. */
export function nextDateAmong<D extends { contactId: string }>(
	ahead: readonly D[],
	contactIds: readonly string[]
): D | null {
	const ids = new Set(contactIds);
	return ahead.find((date) => ids.has(date.contactId)) ?? null;
}

/** What each block's rows are; the edge decides their shape, the brief only picks and orders. */
export interface BriefRows {
	next: unknown;
	home: unknown;
	note: { isPinned: boolean };
	moment: { kind: string };
	todo: unknown;
	idea: { state: string };
}

/** Everything the brief is made of, as read for the person. */
export interface BriefParts<R extends BriefRows> {
	next: R['next'] | null;
	family: readonly FamilyMember[];
	homes: readonly R['home'][];
	notes: readonly R['note'][];
	/** The story, newest first: moments, touchpoints, gifts and ticked to-dos (docs/02 §2.23). */
	story: readonly R['moment'][];
	/** Open to-dos, in the order the person page shows them. */
	todos: readonly R['todo'][];
	gifts: readonly R['idea'][];
	met: string | null;
}

export type BriefBlock<R extends BriefRows> =
	| { kind: 'next'; date: R['next'] }
	| { kind: 'family'; members: readonly FamilyMember[]; homes: readonly R['home'][] }
	| { kind: 'notes'; notes: R['note'][] }
	| { kind: 'lately'; items: R['moment'][] }
	| { kind: 'todos'; todos: readonly R['todo'][] }
	| { kind: 'gifts'; ideas: R['idea'][] }
	| { kind: 'met'; line: string };

/**
 * The blocks in the order one reads them on the doorstep: what is coming up, who they live
 * with, what not to forget, what happened lately, what is still to do or bring, and last how
 * we met. A block with nothing in it is left out, never shown as an empty heading.
 */
export function briefBlocks<R extends BriefRows>(parts: BriefParts<R>): BriefBlock<R>[] {
	const notes = parts.notes.filter((note) => note.isPinned);
	const lately = parts.story
		.filter((item) => item.kind === 'journal' || item.kind === 'interaction')
		.slice(0, LATELY_COUNT);
	const ideas = parts.gifts.filter((gift) => gift.state === 'idea');

	const blocks: (BriefBlock<R> | null)[] = [
		parts.next === null ? null : { kind: 'next', date: parts.next },
		parts.family.length + parts.homes.length === 0
			? null
			: { kind: 'family', members: parts.family, homes: parts.homes },
		notes.length === 0 ? null : { kind: 'notes', notes },
		lately.length === 0 ? null : { kind: 'lately', items: lately },
		parts.todos.length === 0 ? null : { kind: 'todos', todos: parts.todos },
		ideas.length === 0 ? null : { kind: 'gifts', ideas },
		parts.met === null ? null : { kind: 'met', line: parts.met }
	];
	return blocks.filter((block) => block !== null);
}
