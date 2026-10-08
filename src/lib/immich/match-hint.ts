/*
 * The Photos card's suggestion for an unlinked person (docs/02 §2.24.7): the face *Find your
 * people* would link in one tap, offered on the person's own page. Pure: the card's adapter
 * (`$lib/components/person/immich-match-hint.svelte.ts`) asks the server, and this decides when
 * to ask and what to show.
 *
 * Nothing from Immich is shown offline (docs/02 §2.24.3), so neither is the suggestion; a
 * linked person has nothing to be proposed; and an ignored pair goes at once, before the undo
 * window has closed and the no is stored.
 */

/** Where the card stands. */
export interface MatchHintSituation {
	/** This instance has Immich. */
	immichOn: boolean;
	/** Stella is reachable. */
	online: boolean;
	/** The person is linked to a face already. */
	linked: boolean;
}

/** Whether the card asks the server for a suggestion at all. */
export function asksForMatchHint(situation: MatchHintSituation): boolean {
	return situation.immichOn && situation.online && !situation.linked;
}

/**
 * The suggestion to show, or null. `answer` is the server's — null before it arrives, and when
 * there is no likely face; `ignored` is the member's *Ignore*, pending or stored.
 */
export function shownMatchHint<Face>(
	situation: MatchHintSituation & { answer: Face | null; ignored: boolean }
): Face | null {
	if (!asksForMatchHint(situation) || situation.ignored) return null;
	return situation.answer;
}

/** The name the question asks by: *Is this Lena?* — what the household calls them. */
export function matchHintName(contact: {
	displayName: string;
	firstName: string | null;
	nickname: string | null;
}): string {
	return contact.nickname || contact.firstName || contact.displayName;
}
