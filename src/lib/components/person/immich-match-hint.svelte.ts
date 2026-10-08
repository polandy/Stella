/*
 * The browser side of the Photos card's suggestion (docs/02 §2.24.7): asks
 * `/contacts/{id}/immich/match` after the page has loaded — reading all of Immich's people never
 * holds the page up — and keeps the answer for the person it was asked about. When to ask and
 * what to show are decided in `$lib/immich/match-hint`.
 *
 * Quiet on failure: a suggestion that cannot be had is simply not offered.
 */

/** The face the server proposes, as `answerMatchHint` sends it. */
export interface MatchHintFace {
	personId: string;
	/** The name in Immich. */
	name: string;
	/** How many photos they are in, or null when the key may not count them. */
	photoCount: number | null;
	/** The face through Stella's signed proxy. */
	faceUrl: string;
}

async function fetchMatchHint(contactId: string): Promise<MatchHintFace | null> {
	try {
		const response = await fetch(`/contacts/${encodeURIComponent(contactId)}/immich/match`);
		if (!response.ok) return null;
		return ((await response.json()) as { match: MatchHintFace | null }).match;
	} catch {
		// The network went away mid-request: the page is about to say Stella is offline.
		return null;
	}
}

export class ImmichMatchHint {
	/** The server's answer for the person on the page; null until it arrives, and when none. */
	answer = $state<MatchHintFace | null>(null);
	/** The pair whose *Ignore* was stored during this visit, as `contactId/personId`. */
	ignoredPair = $state<string | null>(null);

	/**
	 * `input` names the person and whether to ask at all. Both are primitives, so a reload of the
	 * page's data — after an ignore, say — asks nothing again.
	 */
	constructor(input: () => { contactId: string; asks: boolean }) {
		$effect(() => {
			const { contactId, asks } = input();
			this.answer = null;
			if (!asks) return;
			let current = true;
			void fetchMatchHint(contactId).then((face) => {
				if (current) this.answer = face;
			});
			return () => {
				current = false;
			};
		});
	}
}
