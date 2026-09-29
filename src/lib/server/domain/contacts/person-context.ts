import type { Viewer } from '../../access/visibility';
import {
	rankContext,
	type MembershipCandidate,
	type PersonContext,
	type TieCandidate
} from '../../../people/context';
import { hasNothingTyped, type Distinguishable } from '../../../people/namesakes';

/*
 * What a namesake's second line may fall back on when nothing was typed to tell them apart
 * (docs/02 §2.2.3): their relationships and circles, as far as the viewer may see them. The
 * adapter scopes both reads through the access layer, so the browser is never sent a link or a
 * circle it could not open.
 */

/** A link of `contactId`'s, read from their end. */
export type ContextTieRow = Omit<TieCandidate, 'otherIsViewer'> & { contactId: string };

/** A membership of `contactId`'s in a circle that is not archived. */
export type ContextMembershipRow = MembershipCandidate & { contactId: string };

export interface PersonContextReads {
	/** Every link of these people the viewer may see (both ends visible), from their end. */
	listTiesOfVisibleTo(viewer: Viewer, contactIds: readonly string[]): Promise<ContextTieRow[]>;
	/** Every membership of these people the viewer may see, in circles not archived. */
	listMembershipsOfVisibleTo(viewer: Viewer, contactIds: readonly string[]): Promise<ContextMembershipRow[]>;
}

export interface PersonContextDeps {
	contextReads: PersonContextReads;
}

function groupBy<T extends { contactId: string }>(rows: readonly T[]): Map<string, T[]> {
	const groups = new Map<string, T[]>();
	for (const row of rows) groups.set(row.contactId, [...(groups.get(row.contactId) ?? []), row]);
	return groups;
}

/**
 * The context for every person on `people` whose second line would otherwise say *Nothing
 * yet*, by id; people with nothing to fall back on are left out.
 */
export async function contextOfPeople(
	deps: PersonContextDeps,
	viewer: Viewer,
	input: {
		people: readonly Distinguishable[];
		/** The viewer's own person, whose links read *Your sibling*. */
		selfContactId: string | null;
		/** The viewer's day, which ends a membership whose end date has passed. */
		today: string;
	}
): Promise<Record<string, PersonContext>> {
	const ids = input.people.filter(hasNothingTyped).map((p) => p.id);
	if (ids.length === 0) return {};
	const [ties, memberships] = await Promise.all([
		deps.contextReads.listTiesOfVisibleTo(viewer, ids),
		deps.contextReads.listMembershipsOfVisibleTo(viewer, ids)
	]);
	const tiesOf = groupBy(ties);
	const membershipsOf = groupBy(memberships);
	const context: Record<string, PersonContext> = {};
	for (const id of ids) {
		const ranked = rankContext(
			(tiesOf.get(id) ?? []).map((t) => ({ ...t, otherIsViewer: t.otherId === input.selfContactId })),
			membershipsOf.get(id) ?? [],
			input.today
		);
		if (ranked) context[id] = ranked;
	}
	return context;
}
