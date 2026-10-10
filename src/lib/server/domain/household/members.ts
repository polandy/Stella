import type { Viewer } from '../../access/visibility';

/*
 * The people who share a household (docs/02 §2.1). Everything they write carries their user
 * id; the story turns that id into a name through here, so a page never has to know how
 * accounts are stored.
 */

/** One member of a household, as far as anything outside the account layer needs to know. */
export interface HouseholdMember {
	id: string;
	name: string;
}

/** Port: the members of one household. */
export interface MemberRepository {
	/** Who belongs to the household now. */
	listMembers(householdId: string): Promise<HouseholdMember[]>;
	/**
	 * Everyone who ever wrote in the household: the members, and those an admin removed, whose
	 * work keeps their name (docs/02 §2.1).
	 */
	listAuthors(householdId: string): Promise<HouseholdMember[]>;
}

export interface MemberDeps {
	members: MemberRepository;
}

/**
 * A lookup from user id to name for one household. Ids from anywhere else answer `null`, so a
 * story item written by someone outside the household can never be attributed to a name.
 */
export async function authorNames(
	deps: MemberDeps,
	householdId: string
): Promise<(userId: string) => string | null> {
	const authors = await deps.members.listAuthors(householdId);
	const byId = new Map(authors.map((author) => [author.id, author.name]));
	return (userId) => byId.get(userId) ?? null;
}

/**
 * The viewer's household as it is now (a removed member is no longer offered), the viewer first and the rest in the household's order — the order a
 * "who did it" choice reads in, with the viewer shown as "You" (docs/02 §2.22.2).
 */
export async function membersViewerFirst(
	deps: MemberDeps,
	viewer: Viewer
): Promise<HouseholdMember[]> {
	const members = await deps.members.listMembers(viewer.householdId);
	return [
		...members.filter((member) => member.id === viewer.id),
		...members.filter((member) => member.id !== viewer.id)
	];
}
