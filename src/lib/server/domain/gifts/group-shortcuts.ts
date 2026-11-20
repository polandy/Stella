import { groupShortcuts, type GroupShortcut } from '#lib/gifts/group-form.js';
import type { Viewer } from '../../access/visibility';
import type { CircleMembershipReads } from '../circles/memberships';
import type { HomeReads } from '../homes/homes';
import type { KinshipGraphReads } from '../relationships/suggestion-review';

/* The sets one tap ticks on the form for several people (docs/dev/02 §2.25.11); never stored (F7). */

export interface GroupShortcutDeps {
	kinship: KinshipGraphReads;
	homeReads: Pick<HomeReads, 'listForContactVisibleTo'>;
	memberships: Pick<CircleMembershipReads, 'listForContactVisibleTo' | 'listMembersVisibleTo'>;
}

/** The anchor's family, homes and circles as the viewer sees them; none for someone unseen. */
export async function readGroupShortcuts(
	deps: GroupShortcutDeps,
	viewer: Viewer,
	anchorId: string
): Promise<GroupShortcut[]> {
	const [graph, homes, circles] = await Promise.all([
		deps.kinship.loadKinshipGraphVisibleTo(viewer),
		deps.homeReads.listForContactVisibleTo(viewer, anchorId),
		deps.memberships.listForContactVisibleTo(viewer, anchorId)
	]);
	const names = new Map(graph.people.map((p) => [p.id, p.displayName]));
	const anchorName = names.get(anchorId);
	if (anchorName === undefined) return [];
	const members = await Promise.all(
		circles.map((c) => deps.memberships.listMembersVisibleTo(viewer, c.circleId))
	);
	return groupShortcuts({
		anchor: { id: anchorId, name: anchorName },
		parentEdges: graph.parentEdges,
		siblingEdges: graph.siblingEdges,
		nameOf: (id) => names.get(id),
		homes: homes.map((home) => ({
			name: home.label ?? home.value,
			ids: [anchorId, ...home.livesWith.map((p) => p.id)]
		})),
		circles: circles.map((circle, i) => ({
			name: circle.name,
			ids: members[i].map((m) => m.contactId)
		}))
	});
}
