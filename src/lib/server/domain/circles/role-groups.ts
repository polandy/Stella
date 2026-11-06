import { roleKey } from '../../../circles/role-key';

/*
 * The roles people hold in circles (docs/02 §2.4.2), folded into one rule for which roles are
 * "the same": what to offer when someone joins, and how a circle's members are grouped.
 */

/**
 * The one rule for which roles are "the same": trimmed, case-folded, blank means none. Each
 * role comes back under the spelling the household writes most often (alphabetical on a tie),
 * with the items that carry it, most common role first and ties broken alphabetically. Items
 * without a role are left out.
 */
function foldByRole<T>(
	items: readonly T[],
	roleOf: (item: T) => string | null | undefined
): { label: string; items: T[] }[] {
	const byKey = new Map<string, { items: T[]; spellings: Map<string, number> }>();
	for (const item of items) {
		const key = roleKey(roleOf(item));
		if (key === null) continue;
		const role = (roleOf(item) ?? '').trim();
		const entry = byKey.get(key) ?? { items: [] as T[], spellings: new Map<string, number>() };
		entry.items.push(item);
		entry.spellings.set(role, (entry.spellings.get(role) ?? 0) + 1);
		byKey.set(key, entry);
	}
	return [...byKey.values()]
		.map((e) => {
			const label = [...e.spellings.entries()].sort(
				(a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
			)[0][0];
			return { label, items: e.items };
		})
		.sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label));
}

/**
 * The roles already in use, most common first and ties broken alphabetically — what to offer
 * when someone is added to a circle. Blank roles drop out; spellings that differ only in case
 * fold into the most common one (`Teacher` and `teacher` are one role, not two).
 */
export function suggestRoles(usedRoles: readonly (string | null | undefined)[]): string[] {
	return foldByRole(usedRoles, (role) => role).map((group) => group.label);
}

/** The people of a circle who share one role; `role` is null for those who have none. */
export interface RoleGroup<T> {
	role: string | null;
	members: T[];
}

/**
 * A circle's members grouped by role, in the order `suggestRoles` offers the roles, with the
 * people who have no role last. The members' own order is kept inside each group.
 */
export function groupMembersByRole<T extends { role: string | null }>(
	members: readonly T[]
): RoleGroup<T>[] {
	const groups: RoleGroup<T>[] = foldByRole(members, (m) => m.role).map((g) => ({
		role: g.label,
		members: g.items
	}));
	const withoutRole = members.filter((m) => roleKey(m.role) === null);
	if (withoutRole.length > 0) groups.push({ role: null, members: withoutRole });
	return groups;
}
