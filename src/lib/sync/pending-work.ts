/*
 * What the app is still waiting for, counted in one place (docs/05 §5.7).
 *
 * Saving something that reloads what is on screen — a relationship change and the graph
 * behind it — can take long enough to read as nothing having happened. One store per tab
 * counts that work, and the shell draws a single activity indicator from it, so a section never has
 * to make room for an indicator of its own.
 *
 * A count rather than a flag: two changes that overlap must not let the first one's answer
 * clear the second one's bar. And the count is not the same thing as what is shown — see the
 * two windows below. Nothing here knows about Svelte, forms or fetch; the timer is injected,
 * so the rules are unit-tested without waiting for one.
 */

/**
 * How long work must last before it is worth showing. Below this, a save is over about as soon
 * as it is read, and announcing it only makes the app look busier than it is.
 */
export const SHOW_AFTER_MS = 250;
/** Once the indicator is up it stays at least this long, so it cannot appear as a blink. */
export const MIN_VISIBLE_MS = 400;

/** The timer the store schedules on — `globalThis` in the browser, a fake in tests. */
export interface Scheduler {
	setTimeout(fn: () => void, ms: number): unknown;
	clearTimeout(handle: unknown): void;
}

/** What a caller reports to; the sink side of the store, and all a form needs. */
export interface PendingSink {
	/**
	 * `label` says in a few words what the work is waiting for — *Asking Immich for its
	 * people…* — when the generic *Updating…* would say too little; `end` names it again.
	 */
	begin(label?: string): void;
	end(label?: string): void;
}

export interface PendingWork extends PendingSink {
	/** Whether the app should be showing that it is working right now. */
	busy(): boolean;
	/**
	 * What the newest worded work in flight is waiting for, or null to say the generic thing.
	 * Kept while the indicator stays up for its minimum, so its words do not change on the way out.
	 */
	label(): string | null;
	/** Called when `busy()` or, while shown, `label()` changes — never for a change that leaves both as they were. */
	subscribe(listener: () => void): () => void;
}

export interface PendingWorkDeps {
	scheduler: Scheduler;
	showAfterMs?: number;
	minVisibleMs?: number;
}

export function createPendingWork(deps: PendingWorkDeps): PendingWork {
	const showAfterMs = deps.showAfterMs ?? SHOW_AFTER_MS;
	const minVisibleMs = deps.minVisibleMs ?? MIN_VISIBLE_MS;
	const { scheduler } = deps;

	let inFlight = 0;
	let visible = false;
	/** True between showing the indicator and its minimum being up; it may not be hidden yet. */
	let held = false;
	let showTimer: unknown = null;

	/** The words of the worded work in flight, oldest first. */
	const labels: string[] = [];
	let label: string | null = null;

	const listeners = new Set<() => void>();
	const announce = () => listeners.forEach((listener) => listener());

	function relabel(): void {
		const next = labels.at(-1) ?? (visible ? label : null);
		if (next === label) return;
		label = next;
		if (visible) announce();
	}

	function show(): void {
		showTimer = null;
		visible = true;
		held = true;
		scheduler.setTimeout(() => {
			held = false;
			hideIfDone();
		}, minVisibleMs);
		announce();
	}

	/** The indicator goes only when nothing is in flight *and* it has been up long enough. */
	function hideIfDone(): void {
		if (!visible || held || inFlight > 0) return;
		visible = false;
		label = null;
		announce();
	}

	return {
		begin(words) {
			inFlight += 1;
			if (words !== undefined) {
				labels.push(words);
				relabel();
			}
			if (inFlight > 1 || visible) return;
			showTimer = scheduler.setTimeout(show, showAfterMs);
		},
		end(words) {
			// Fail loud: an unbalanced end would leave the count below idle, and from then on
			// the indicator would stay hidden through work that really is in flight.
			if (inFlight === 0) throw new Error('PendingWork.end() called while nothing was pending');
			inFlight -= 1;
			if (words !== undefined) {
				const at = labels.lastIndexOf(words);
				if (at >= 0) labels.splice(at, 1);
				relabel();
			}
			if (inFlight > 0) return;
			if (showTimer !== null) {
				// Over before it was worth showing: nothing was drawn, so nothing has to go.
				scheduler.clearTimeout(showTimer);
				showTimer = null;
			}
			hideIfDone();
		},
		busy: () => visible,
		label: () => label,
		subscribe(listener) {
			listeners.add(listener);
			return () => void listeners.delete(listener);
		}
	};
}
