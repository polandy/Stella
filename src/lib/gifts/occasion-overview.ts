import type { GiftState } from './gifts';
import { isAssigned, type GiverView } from './giver';
import { occasionTally } from './occasions';

// The household's list by occasion (docs/dev/02 §2.25.6): every recipient under each day.

/** What the overview reads of a planned gift, its day already resolved for its recipient. */
export interface OverviewGift {
	id: string;
	contactId: string;
	contactName: string;
	avatarPhotoId: string | null;
	title: string;
	state: GiftState;
	/** The ISO day of its occasion; null without one. */
	on: string | null;
	giver: GiverView;
	hiddenFromRecipient: boolean;
}

type Tally = ReturnType<typeof occasionTally>;

export interface OverviewRecipient {
	contactId: string;
	contactName: string;
	avatarPhotoId: string | null;
	tally: Tally;
	gifts: OverviewGift[];
}

export interface OverviewOccasion {
	on: string | null;
	tally: Tally;
	recipients: OverviewRecipient[];
}

/** Taken first, then free, then the ones already done. */
const rank = (gift: OverviewGift): number =>
	gift.state === 'bought' ? 2 : isAssigned(gift.giver) ? 0 : 1;

/**
 * The planned gifts by day, soonest first. Gifts without an occasion come last and only when
 * somebody gives them or they are done; a free undated idea stays on the by-person list.
 */
export function occasionOverview(gifts: readonly OverviewGift[]): OverviewOccasion[] {
	const days = new Map<string | null, OverviewGift[]>();
	for (const gift of gifts) {
		if (gift.on === null && gift.state !== 'bought' && !isAssigned(gift.giver)) continue;
		days.set(gift.on, [...(days.get(gift.on) ?? []), gift]);
	}
	return [...days.entries()]
		.sort(([a], [b]) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1))
		.map(([on, onDay]) => ({
			on,
			tally: occasionTally(onDay),
			recipients: recipientsOf(onDay)
		}));
}

function recipientsOf(gifts: readonly OverviewGift[]): OverviewRecipient[] {
	const byContact = new Map<string, OverviewGift[]>();
	for (const gift of gifts)
		byContact.set(gift.contactId, [...(byContact.get(gift.contactId) ?? []), gift]);
	return [...byContact.values()]
		.map((own) => {
			const sorted = [...own].sort((a, b) => rank(a) - rank(b));
			const { contactId, contactName, avatarPhotoId } = own[0]!;
			return { contactId, contactName, avatarPhotoId, tally: occasionTally(own), gifts: sorted };
		})
		.sort((a, b) => a.contactName.localeCompare(b.contactName));
}
