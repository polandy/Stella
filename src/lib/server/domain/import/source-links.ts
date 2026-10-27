import type { StellaPerson } from '../../../import-match/card';
import type { Viewer } from '../../access/visibility';
import type { VCardSource } from './vcard-source';

/*
 * The answers the household gave for the cards of another address book (docs/02 §2.16, the
 * matching review): this card is that person, or it was skipped. Kept per source and card key,
 * so a re-run of the same export asks only about what is new or changed, and a skip holds.
 *
 * Like a declined suggestion, an answer belongs to the household, not to the member who gave
 * it. What it may *say* follows the person it names: a card linked to someone the member may
 * not see, or someone archived, is only said to be taken care of — never who it is.
 */

export type ContactSource = VCardSource;

export type SourceLinkState = 'linked' | 'skipped';

/** One remembered answer, as written. */
export interface SourceLink {
	source: ContactSource;
	/** The card's key (`readContactCards`): its UID, or what stands in for one. */
	externalUid: string;
	/** The person the card is; null when it was skipped. */
	contactId: string | null;
	state: SourceLinkState;
	/** The card's name when answered, so a skipped card can be listed without its file. */
	cardName: string;
	/** The card as answered (`IncomingCard.hash`): a different hash is a changed card. */
	cardHash: string;
	answeredBy: string;
	answeredAt: number;
}

/** A remembered answer as the member may learn it. */
export type RememberedAnswer =
	| { state: 'linked'; personId: string; cardHash: string }
	/**
	 * Linked to a person the member may not browse — someone else's private person, or someone
	 * archived. The card is left alone; who it is stays unsaid.
	 */
	| { state: 'out-of-reach' }
	| { state: 'skipped' };

/** A card the household skipped, for *Skipped contacts* and its *Ask again*. */
export interface SkippedCard {
	source: ContactSource;
	externalUid: string;
	cardName: string;
	answeredBy: string;
	answeredAt: number;
}

/** Where the answers are kept, and the people a card may be matched against. */
export interface ContactSourceRepository {
	/** Every answer the household gave for this source, by card key. */
	answersFor(viewer: Viewer, source: ContactSource): Promise<Map<string, RememberedAnswer>>;
	/**
	 * The people a card may be matched against: those the member may browse — never a private
	 * person of someone else, never one archived — with what the merge plan compares.
	 */
	matchablePeople(viewer: Viewer): Promise<StellaPerson[]>;
	/** The household's skipped cards, newest answer first. */
	skippedFor(viewer: Viewer): Promise<SkippedCard[]>;
	/** Forgets a skip, so the card is asked about next time; false when there was none. */
	askAgain(viewer: Viewer, source: ContactSource, externalUid: string): Promise<boolean>;
}
