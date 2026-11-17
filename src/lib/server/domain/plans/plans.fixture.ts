import type { Viewer } from '../../access/visibility';
import type { DonePlan, Plan, PlanRepository } from './plans';

/*
 * An in-memory PlanRepository for the use-case tests. It keeps the adapter's rule — a private
 * idea reaches only its author, a surprise never the member whose own person it is with — so the
 * use-cases can be seen relying on it; the Drizzle adapter proves the rule itself.
 */

/** `ownPeople`: a person's id, to the member whose own person it is. */
export function fakePlans(
	ownPeople: Map<string, string> = new Map()
): PlanRepository & { rows: Map<string, Plan> } {
	const rows = new Map<string, Plan>();
	const visible = (viewer: Viewer, plan: Plan) =>
		(plan.visibility === 'shared' || plan.createdBy === viewer.id) &&
		!(
			plan.hiddenFromPerson &&
			plan.createdBy !== viewer.id &&
			ownPeople.get(plan.contactId) === viewer.id
		);
	return {
		rows,
		async insert(plan) {
			rows.set(plan.id, { ...plan });
		},
		async findVisibleTo(viewer, contactId, planId) {
			const plan = rows.get(planId);
			return plan && plan.contactId === contactId && visible(viewer, plan) ? { ...plan } : null;
		},
		async update(plan) {
			rows.set(plan.id, { ...plan });
		},
		async remove(planId) {
			rows.delete(planId);
		},
		async listOpenVisibleTo(viewer) {
			return [...rows.values()]
				.filter((p) => p.doneAt === null && visible(viewer, p))
				.map((p) => ({ ...p, contactName: p.contactId, avatarPhotoId: null, birth: null }));
		},
		async listForContactVisibleTo(viewer, contactId) {
			return [...rows.values()].filter((p) => p.contactId === contactId && visible(viewer, p));
		},
		async listStoryPageForContactVisibleTo(viewer, contactId, opts) {
			const before = opts.before;
			return [...rows.values()]
				.filter(
					(p): p is DonePlan =>
						p.contactId === contactId &&
						p.doneOn !== null &&
						p.doneAt !== null &&
						visible(viewer, p)
				)
				.filter(
					(p) =>
						!before ||
						p.doneOn < before.doneOn ||
						(p.doneOn === before.doneOn && p.doneAt < before.doneAt)
				)
				.sort((a, b) => b.doneOn.localeCompare(a.doneOn) || b.doneAt - a.doneAt)
				.slice(0, opts.limit);
		},
		async memberWhoseOwnPerson(_householdId, contactId) {
			return ownPeople.get(contactId) ?? null;
		}
	};
}
