import type { PartialDate } from '../dates/partial-date';
import { contactSectionPath } from '../people/sections';
import { whenDay } from '../when/resolve';
import type { When } from '../when/when';
import { hasGiftDay, type GiftState } from './gifts';

// *Who has it?* for one idea several people get (docs/dev/02 §2.25.11): its order and the card's line.

/** What a row of the panel is ordered by. */
export interface PanelMember {
	contactId: string;
	name: string;
	birth: PartialDate | null;
	state: GiftState;
	givenOn: string | null;
	when: When | null;
}

/** The day an open gift comes to: *now* first, *later* last. */
function openDay({ when, birth }: PanelMember): string {
	if (when === null) return '';
	if (when.kind === 'later') return '~';
	return whenDay(when, birth)?.on ?? '';
}

/** Who has it first, by the day they got it; then the rest by the day it comes to for them. */
export function panelOrder<M extends PanelMember>(members: readonly M[]): M[] {
	const key = (m: M): [number, string] =>
		hasGiftDay(m.state) ? [0, m.givenOn ?? ''] : [1, openDay(m)];
	return [...members].sort((a, b) => {
		const [ra, da] = key(a);
		const [rb, db] = key(b);
		return ra - rb || (da < db ? -1 : da > db ? 1 : 0) || a.name.localeCompare(b.name);
	});
}

/** Everyone else the idea is for, as the card's *also for* line names them (D4). */
export function alsoFor(
	members: readonly Pick<PanelMember, 'contactId' | 'name'>[],
	contactId: string
): string[] {
	return members.filter((m) => m.contactId !== contactId).map((m) => m.name);
}

const GROUP_PARAM = 'group';

/** A link that opens *Who has it?* on this person's Gifts card — from `/gifts` or the calendar. */
export function giftGroupPanelPath(contactId: string, groupId: string): string {
	return contactSectionPath(contactId, 'gifts', `${GROUP_PARAM}=${encodeURIComponent(groupId)}`);
}

/** The group a page address asks to open (`giftGroupPanelPath`), if any. */
export function opensGiftGroup(url: URL): string | null {
	return url.searchParams.get(GROUP_PARAM);
}
