import type { PartialDate } from '../dates/partial-date';
import { whenDay } from '../when/resolve';
import type { When } from '../when/when';
import type { GiftState } from './gifts';
import { isAssigned, type GiverView } from './giver';

// The Gifts card by occasion (docs/dev/02 §2.25.13): who gives what, what is done, what is free.

/** What grouping reads of a gift. */
export interface OccasionGift {
	state: GiftState;
	when: When | null;
	giver: GiverView;
}

/** One occasion's gifts, open first, bought last; `on` null is *Without an occasion*. */
export interface OccasionGroup<T> {
	on: string | null;
	/** The when the group was first found under, for its label. */
	when: When | null;
	gifts: T[];
}

/** The day a gift is for, if its when names one: a set age, a Christmas, a date. */
export function occasionDayOf(
	gift: Pick<OccasionGift, 'when'>,
	birth: PartialDate | null
): string | null {
	const when = gift.when;
	if (when === null) return null;
	if (when.kind !== 'at_age' && when.kind !== 'christmas_at_age' && when.kind !== 'on_date') {
		return null;
	}
	return whenDay(when, birth)?.on ?? null;
}

/** The gifts by occasion, soonest first, none last; null while no gift has a giver or a day. */
export function byOccasion<T extends OccasionGift>(
	gifts: readonly T[],
	birth: PartialDate | null
): OccasionGroup<T>[] | null {
	if (!gifts.some((gift) => isAssigned(gift.giver) || occasionDayOf(gift, birth) !== null))
		return null;
	const groups = new Map<string | null, OccasionGroup<T>>();
	const ordered = [
		...gifts.filter((gift) => gift.state !== 'bought'),
		...gifts.filter((gift) => gift.state === 'bought')
	];
	for (const gift of ordered) {
		const on = occasionDayOf(gift, birth);
		const group = groups.get(on);
		if (group) group.gifts.push(gift);
		else groups.set(on, { on, when: on === null ? null : gift.when, gifts: [gift] });
	}
	return [...groups.values()].sort((a, b) =>
		a.on === b.on ? 0 : a.on === null ? 1 : b.on === null ? -1 : a.on < b.on ? -1 : 1
	);
}

/** A group's head count: *2 done · 1 taken · 1 free*. */
export function occasionTally(gifts: readonly Pick<OccasionGift, 'state' | 'giver'>[]): {
	done: number;
	assigned: number;
	free: number;
} {
	const ideas = gifts.filter((gift) => gift.state === 'idea');
	const assigned = ideas.filter((gift) => isAssigned(gift.giver)).length;
	return {
		done: gifts.filter((gift) => gift.state === 'bought').length,
		assigned,
		free: ideas.length - assigned
	};
}

/** Whether the household hands it over itself (D17): *Besorgt…* then, else *Erledigt*. */
export function handsOver(giver: GiverView, householdGivers: ReadonlySet<string>): boolean {
	if (giver.kind === 'none' || giver.kind === 'household') return true;
	return giver.kind === 'person' && householdGivers.has(giver.contactId);
}
