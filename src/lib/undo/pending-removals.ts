/*
 * Removing with undo (docs/02 §2.23, docs/05 §5.7).
 *
 * A removal is not sent to the server when the button is pressed. It is held here, hidden
 * from the screen, for one window in which a toast offers *Undo*; the request goes out only
 * when the window closes or the page is left (docs/04 §4.9). Nothing in this module knows
 * about Svelte, forms or fetch: the timer is injected and the request is a callback, so the
 * rules of the window are unit-tested without waiting for it.
 */

/** How long a removal can be taken back, in milliseconds. */
export const UNDO_WINDOW_MS = 8000;

/** The timer the store schedules on — `globalThis` in the browser, a fake in tests. */
export interface Scheduler {
	setTimeout(fn: () => void, ms: number): unknown;
	clearTimeout(handle: unknown): void;
}

/** One thing waiting to be removed. `commit` performs the real removal and rejects if it failed. */
export interface Removal {
	/** Identifies the item on screen, e.g. `journal:<id>`, so the list can hide it. */
	key: string;
	/** What the toast says, e.g. "Removed entry". */
	label: string;
	commit: () => Promise<void> | void;
}

/**
 * A message, e.g. "Saved" or the reason a removal failed. `undoable` when it announces an
 * addition that can be taken back — "2 links saved" — whose *Undo* runs `takeBack(id)`.
 */
export interface Notice {
	id: number;
	text: string;
	undoable: boolean;
}

/** What a toast region renders: removals carry *Undo*, notices are read-only. */
export interface RemovalsSnapshot {
	removals: readonly Removal[];
	notices: readonly Notice[];
}

export interface PendingRemovals {
	/** Hides the item and starts its window. A key already pending is left alone. */
	remove(removal: Removal): void;
	/** Takes a pending removal back; unknown keys are ignored. */
	undo(key: string): void;
	/** Commits everything still pending — called when the page is left. */
	flush(): Promise<void>;
	isPending(key: string): boolean;
	/**
	 * Shows a message for one window. With `takeBack`, the message carries *Undo*: the thing it
	 * announces is already done, so nothing happens when the window closes, and pressing it
	 * runs `takeBack` — which reports its own failure, since only it knows what went wrong.
	 */
	notify(text: string, takeBack?: () => void): void;
	/** *Undo* on an undoable notice: drops it and runs its `takeBack`, once. Otherwise a no-op. */
	takeBack(noticeId: number): void;
	/**
	 * Stops every window while the reader is at the toasts — hovering them or focused in them —
	 * so Undo cannot run out under their hand (WCAG 2.2.1). A second hold is a no-op.
	 */
	hold(): void;
	/** Lets the windows run again, each from a full window. A release without a hold is a no-op. */
	release(): void;
	snapshot(): RemovalsSnapshot;
	/** Called after every change; returns the unsubscribe. */
	subscribe(listener: () => void): () => void;
}

/** What the store is built from; only the app shell supplies the real timer. */
export interface PendingRemovalsDeps {
	scheduler: Scheduler;
	windowMs?: number;
	/** A failed commit is reported here; the item is already back on screen by then. */
	onCommitFailed: (removal: Removal, error: unknown) => void;
}

interface Pending {
	removal: Removal;
	timer: unknown;
}

interface ShownNotice {
	notice: Notice;
	timer: unknown;
	takeBack?: () => void;
}

/** Builds the store the app shell holds for one browser tab. */
export function createPendingRemovals(deps: PendingRemovalsDeps): PendingRemovals {
	const { scheduler, onCommitFailed } = deps;
	const windowMs = deps.windowMs ?? UNDO_WINDOW_MS;
	const pending = new Map<string, Pending>();
	const notices: ShownNotice[] = [];
	const listeners = new Set<() => void>();
	let nextNoticeId = 1;
	let held = false;

	const changed = () => {
		for (const listener of listeners) listener();
	};

	/** Runs the real removal; a failure is reported, never swallowed, and the item is back by then. */
	async function perform(removal: Removal) {
		try {
			await removal.commit();
		} catch (error) {
			onCommitFailed(removal, error);
		}
	}

	function windowClosed(entry: Pending) {
		pending.delete(entry.removal.key);
		changed();
		void perform(entry.removal);
	}

	function armRemoval(entry: Pending) {
		entry.timer = held ? undefined : scheduler.setTimeout(() => windowClosed(entry), windowMs);
	}

	function armNotice(shown: ShownNotice) {
		shown.timer = held ? undefined : scheduler.setTimeout(() => dismissNotice(shown.notice.id), windowMs);
	}

	function dismissNotice(id: number) {
		const index = notices.findIndex((shown) => shown.notice.id === id);
		if (index === -1) return;
		notices.splice(index, 1);
		changed();
	}

	return {
		remove(removal) {
			if (pending.has(removal.key)) return;
			const entry: Pending = { removal, timer: undefined };
			armRemoval(entry);
			pending.set(removal.key, entry);
			changed();
		},
		undo(key) {
			const entry = pending.get(key);
			if (!entry) return;
			scheduler.clearTimeout(entry.timer);
			pending.delete(key);
			changed();
		},
		async flush() {
			// Everything leaves the list before the first request goes out, so a second flush
			// (navigation and pagehide can both fire) never sends a removal twice.
			const entries = [...pending.values()];
			for (const entry of entries) scheduler.clearTimeout(entry.timer);
			pending.clear();
			if (entries.length) changed();
			for (const entry of entries) await perform(entry.removal);
		},
		isPending: (key) => pending.has(key),
		notify(text, takeBack) {
			const shown: ShownNotice = {
				notice: { id: nextNoticeId++, text, undoable: takeBack !== undefined },
				timer: undefined,
				takeBack
			};
			armNotice(shown);
			notices.push(shown);
			changed();
		},
		takeBack(noticeId) {
			const shown = notices.find((candidate) => candidate.notice.id === noticeId);
			if (!shown?.takeBack) return;
			scheduler.clearTimeout(shown.timer);
			dismissNotice(noticeId);
			shown.takeBack();
		},
		hold() {
			if (held) return;
			held = true;
			for (const entry of pending.values()) scheduler.clearTimeout(entry.timer);
			for (const shown of notices) scheduler.clearTimeout(shown.timer);
		},
		release() {
			if (!held) return;
			held = false;
			for (const entry of pending.values()) armRemoval(entry);
			for (const shown of notices) armNotice(shown);
		},
		snapshot: () => ({
			removals: [...pending.values()].map((entry) => entry.removal),
			notices: notices.map((shown) => shown.notice)
		}),
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		}
	};
}
