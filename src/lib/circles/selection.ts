/*
 * Choosing several members of a circle to re-role or remove them together (docs/02 §2.4.2).
 * The selection is a list of contact ids in the order they were chosen; the page owns it and
 * these say how one gesture changes it.
 */

/** One person ticked or unticked. */
export function toggleMember(selected: readonly string[], contactId: string): string[] {
	return selected.includes(contactId)
		? selected.filter((id) => id !== contactId)
		: [...selected, contactId];
}

/** Whether all of a group is chosen; an empty group never is. */
export function allChosen(groupIds: readonly string[], selected: readonly string[]): boolean {
	return groupIds.length > 0 && groupIds.every((id) => selected.includes(id));
}

/** The *all* box beside a role heading: chooses the whole group, or lets all of it go. */
export function toggleGroup(selected: readonly string[], groupIds: readonly string[]): string[] {
	return allChosen(groupIds, selected)
		? selected.filter((id) => !groupIds.includes(id))
		: [...new Set([...selected, ...groupIds])];
}

/** The bar's *Everyone* / *No one* button. */
export function toggleEveryone(selected: readonly string[], everyoneIds: readonly string[]): string[] {
	return allChosen(everyoneIds, selected) ? [] : [...everyoneIds];
}
