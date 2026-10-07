import { filterPeople, type SelectablePerson } from '$lib/people/select';
import { roleKey } from './role-key';

/*
 * Whom a group photo's profile picture is cut for (docs/02 §2.4.2). The
 * people most likely on the photo come first — the circle's members, those in the photo's role
 * ahead of the rest — and a search reaches everyone else the viewer can see. Someone already
 * wearing a cut of this photo is marked, so a whole class gets its pictures in one sitting
 * without anybody being done twice by accident. Pure, so the dialog only draws the result.
 */

/** A person as the picker shows them: the shell's people carry exactly this. */
export type CandidatePerson = SelectablePerson;

/** A person offered in the picker, and whether they wear a cut of this photo already. */
export type CutCandidate = CandidatePerson & { wearsCut: boolean };

export interface CutCandidateGroups {
	/** Members whose role is the photo's role. */
	inRole: CutCandidate[];
	/** The circle's other members. */
	inCircle: CutCandidate[];
	/** Anyone else the viewer can see — only once something is typed. */
	others: CutCandidate[];
}

export function cutCandidates(input: {
	/** The circle's members, in the members list's order. */
	members: readonly { contactId: string; role: string | null }[];
	/** Everyone the viewer can see (the shell's people). */
	people: readonly CandidatePerson[];
	photoRole: string | null;
	/** Who wears a cut of this photo already. */
	wearing: readonly string[];
	query: string;
}): CutCandidateGroups {
	const byId = new Map(input.people.map((p) => [p.id, p]));
	const wearing = new Set(input.wearing);
	const mark = (p: CandidatePerson): CutCandidate => ({ ...p, wearsCut: wearing.has(p.id) });
	const matching = (list: CandidatePerson[]) =>
		new Set(filterPeople(input.query, list).map((p) => p.id));

	const photoKey = roleKey(input.photoRole);
	const memberIds = new Set(input.members.map((m) => m.contactId));
	// A member the viewer cannot see is not among their people, so it is not offered either.
	const members = input.members.flatMap((m) => {
		const p = byId.get(m.contactId);
		return p ? [{ person: p, inRole: photoKey !== null && roleKey(m.role) === photoKey }] : [];
	});
	const shownMembers = matching(members.map((m) => m.person));
	const pick = (inRole: boolean) =>
		members
			.filter((m) => m.inRole === inRole && shownMembers.has(m.person.id))
			.map((m) => mark(m.person));

	const others =
		input.query.trim() === ''
			? []
			: filterPeople(
					input.query,
					input.people.filter((p) => !memberIds.has(p.id))
				).map(mark);
	return { inRole: pick(true), inCircle: pick(false), others };
}
