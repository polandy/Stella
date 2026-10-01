import { newPersonHref } from '../people/new-person';

/*
 * The first-run card on Home (docs/02 §2.22.3). A household fresh out of setup lands on an
 * empty stream with nothing to act on; the card names the three ways in instead. Pure, so the
 * rule for when it shows and what counts as done is tested here rather than read off markup.
 */

/** The steps the card can offer, in the order it offers them. */
export type WelcomeStepId = 'self' | 'import' | 'add';

export interface WelcomeStep {
	id: WelcomeStepId;
	href: string;
	done: boolean;
}

/** What the card is decided from: who the member can see, who they are, and whether they run it. */
export interface HouseholdSoFar {
	/** The people the member can see, archived ones left out. */
	peopleIds: readonly string[];
	selfContactId: string | null;
	/** The Monica import is admin-only (docs/02 §2.16), so only an admin is offered it. */
	isAdmin: boolean;
}

/**
 * The card's steps, or null when there is no card. It shows while the household holds nobody
 * but the member: adding yourself first is the suggested start, and the card must not vanish
 * at the very moment its first step is done. Anybody else — added by hand or imported — means
 * the household has begun, and Home is the stream from then on.
 */
export function welcomeSteps(household: HouseholdSoFar): WelcomeStep[] | null {
	const { peopleIds, selfContactId, isAdmin } = household;
	const hasAddedThemselves = selfContactId !== null && peopleIds.includes(selfContactId);
	const othersThere = peopleIds.length - (hasAddedThemselves ? 1 : 0);
	if (othersThere > 0) return null;

	const steps: WelcomeStep[] = [{ id: 'self', href: newPersonHref({ self: true }), done: hasAddedThemselves }];
	if (isAdmin) steps.push({ id: 'import', href: '/settings/import', done: false });
	steps.push({ id: 'add', href: newPersonHref(), done: false });
	return steps;
}
