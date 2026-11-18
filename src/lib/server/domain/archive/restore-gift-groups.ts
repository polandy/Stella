import { whenColumns, whenFromOutside } from '../../../when/when';
import type { RestoreContext } from './restore-context';
import { bool, int, records, str, visibilityOf, type Row } from './restore-fields';
import { webLinkOf } from './restore-records';

// A group comes back only with a gift in it; a gift that lost its group stands alone (ADR-134).

export function planGiftGroups(
	document: Row,
	gifts: readonly Row[],
	ctx: RestoreContext
): { groups: Row[]; gifts: Row[] } {
	const written = new Map<string, Row>();
	for (const group of records(document, 'gift_groups')) {
		const id = str(group, 'id');
		if (id !== null && str(group, 'title') !== null) written.set(id, group);
	}

	let lost = false;
	const used = new Set<string>();
	const placed = gifts.map((gift) => {
		const groupId = gift.group_id;
		if (typeof groupId !== 'string') return gift;
		if (written.has(groupId)) {
			used.add(groupId);
			return gift;
		}
		lost = true;
		return { ...gift, group_id: null };
	});
	if (lost) ctx.warn({ code: 'giftGroupMissing' });

	if ([...written.keys()].some((id) => !used.has(id))) ctx.warn({ code: 'giftGroupEmpty' });
	const groups = [...written]
		.filter(([id]) => used.has(id))
		.map(([id, group]) => {
			const visibility = visibilityOf(group);
			const when = whenFromOutside({
				whenKind: str(group, 'when_kind'),
				whenOn: str(group, 'when_on'),
				whenAge: int(group, 'when_age')
			});
			const { whenKind, whenOn, whenAge } = whenColumns(when);
			return {
				id,
				household_id: ctx.householdId,
				created_by: ctx.author(group),
				title: str(group, 'title'),
				note: str(group, 'note'),
				url: webLinkOf(str(group, 'url')),
				when_kind: whenKind,
				when_on: whenOn,
				when_age: whenAge,
				occasion: str(group, 'occasion'),
				visibility,
				// Only a shared group can be a surprise, as only a shared gift can.
				hidden_from_recipients:
					visibility === 'shared' && bool(group, 'hidden_from_recipients') ? 1 : 0,
				...ctx.stamps(group)
			};
		});
	return { groups, gifts: placed };
}
