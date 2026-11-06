/*
 * How the outbox paces its sends (docs/02 §2.18.1): one round at a time; a send asked for while
 * one runs goes once more after it; and when the last round is over, whoever still watches a
 * save is told — also when a round threw (a full disk, a database blocked by another tab's
 * upgrade, a corrupt record). Otherwise a form would wait for its save for ever. Pure of
 * IndexedDB and `fetch`: the round itself is handed in.
 */

export interface SendRoundsDeps {
	/** Send what waits. May throw; the items it took stay queued for the next chance. */
	round: () => Promise<void>;
	/** The rounds are over: tell every save still watched what became of it. */
	roundOver: () => void;
	/** A round threw. */
	failed: (error: unknown) => void;
}

/** A `send` that runs `round` as described above, and never rejects. */
export function sendRounds({ round, roundOver, failed }: SendRoundsDeps): () => Promise<void> {
	let sending = false;
	let again = false;

	return async function send(): Promise<void> {
		if (sending) {
			again = true;
			return;
		}
		sending = true;
		try {
			do {
				again = false;
				try {
					await round();
				} catch (error) {
					failed(error);
				}
			} while (again);
		} finally {
			sending = false;
		}
		roundOver();
	};
}
