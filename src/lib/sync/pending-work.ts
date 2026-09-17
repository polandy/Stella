/*
 * What the app is still waiting for, counted in one place (docs/05 §5.7).
 *
 * Saving something that reloads what is on screen — a relationship change and the graph
 * behind it — can take long enough to read as nothing having happened. One store per tab
 * counts that work, and the shell draws a single activity bar from it, so a section never has
 * to make room for a badge of its own.
 *
 * A count rather than a flag: two changes that overlap must not let the first one's answer
 * clear the second one's bar. Nothing here knows about Svelte, forms or fetch.
 */

/** What a caller reports to; the sink side of the store, and all a form needs. */
export interface PendingSink {
	begin(): void;
	end(): void;
}

export interface PendingWork extends PendingSink {
	/** Whether anything is in flight right now. */
	busy(): boolean;
	/** Called when `busy()` changes — never for a change that leaves it as it was. */
	subscribe(listener: () => void): () => void;
}

export function createPendingWork(): PendingWork {
	let inFlight = 0;
	const listeners = new Set<() => void>();
	const announce = () => listeners.forEach((listener) => listener());

	return {
		begin() {
			inFlight += 1;
			if (inFlight === 1) announce();
		},
		end() {
			// Fail loud: an unbalanced end would leave the count below idle, and from then on
			// the bar would stay hidden through work that really is in flight.
			if (inFlight === 0) throw new Error('PendingWork.end() called while nothing was pending');
			inFlight -= 1;
			if (inFlight === 0) announce();
		},
		busy: () => inFlight > 0,
		subscribe(listener) {
			listeners.add(listener);
			return () => void listeners.delete(listener);
		}
	};
}
