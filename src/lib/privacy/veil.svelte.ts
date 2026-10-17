import { getContext, onMount, setContext, untrack } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import type { DeviceUnlock } from './device-unlock';
import {
	LOCKED,
	hideOne,
	isTapped,
	isVeiled,
	leavePage,
	lockAll,
	openWindow,
	revealPath,
	secondsLeft,
	showOne,
	windowOpen,
	type VeilState
} from './veil';

/*
 * The veil's state for this tab (docs/02 §2.10.1), handed down through context: which entries
 * a tap showed, the window that shows everything, and which veiled entries the page holds, so
 * the header lock can count them. An adapter: the rules are `veil.ts`.
 *
 * Context, not a module singleton: on the server a module is shared by every request. The
 * window lives in memory only; a reload starts blurred.
 */

const CONTEXT_KEY = Symbol('privacy-veil');

export interface Veil {
	/** The member's *Blur my private entries*; reactive. */
	readonly enabled: boolean;
	readonly device: DeviceUnlock;
	/** Reactive. */
	isVeiled(id: string): boolean;
	/** Shown by a tap of its own, so it offers *Hide*; reactive. */
	isTapped(id: string): boolean;
	/** A tap on a veil: that one entry, or everything after the device's check. */
	reveal(id: string): Promise<void>;
	hide(id: string): void;
	/** The editor opened on it: the author is writing it anyway, so no check is asked. */
	revealForEdit(id: string): void;
	/** The header lock: show everything for the window, or lock again while it is open. */
	toggleAll(): Promise<void>;
	readonly windowOpen: boolean;
	readonly secondsLeft: number;
	/** How many private entries on the page are blurred right now. */
	readonly veiledCount: number;
	/** Whether the page shows any private entry at all. */
	readonly holdsAny: boolean;
	/** A veiled entry on screen; the returned function takes it off again. */
	register(id: string): () => void;
	/** The page was left: what a tap showed is blurred again. */
	leftPage(): void;
}

/**
 * Creates the veil for this tab and puts it in context. Call once, from the app shell. Stella
 * going to the background locks everything at once, whatever was shown.
 */
export function provideVeil(options: {
	enabled: () => boolean;
	device: DeviceUnlock;
	/** Said when the device's check did not confirm the member. */
	onUnlockFailed: () => void;
}): Veil {
	let state = $state.raw<VeilState>(LOCKED);
	// Ticks once a second while the window is open, so the countdown and its end are seen.
	let now = $state(Date.now());
	const onScreen = new SvelteMap<string, number>();
	const openUntil = $derived(state.openUntil);

	$effect(() => {
		if (openUntil === null) return;
		now = Date.now();
		const timer = setInterval(() => {
			now = Date.now();
			if (!windowOpen(state, now)) state = { ...state, openUntil: null };
		}, 1000);
		return () => clearInterval(timer);
	});

	onMount(() => {
		const onVisibility = () => {
			if (document.visibilityState === 'hidden') state = lockAll();
		};
		document.addEventListener('visibilitychange', onVisibility);
		return () => document.removeEventListener('visibilitychange', onVisibility);
	});

	async function unlockAll() {
		if (revealPath(options.device.status) === 'verify' && !(await options.device.verify())) {
			options.onUnlockFailed();
			return;
		}
		now = Date.now();
		state = openWindow(state, now);
	}

	const veil: Veil = {
		get enabled() {
			return options.enabled();
		},
		device: options.device,
		isVeiled: (id) => isVeiled(state, id, options.enabled(), now),
		isTapped: (id) => options.enabled() && isTapped(state, id, now),
		async reveal(id) {
			if (revealPath(options.device.status) === 'verify') return unlockAll();
			state = showOne(state, id);
		},
		hide(id) {
			state = hideOne(state, id);
		},
		revealForEdit(id) {
			state = showOne(state, id);
		},
		async toggleAll() {
			if (windowOpen(state, now)) {
				state = lockAll();
				return;
			}
			await unlockAll();
		},
		get windowOpen() {
			return windowOpen(state, now);
		},
		get secondsLeft() {
			return secondsLeft(state, now);
		},
		get veiledCount() {
			let count = 0;
			for (const id of onScreen.keys()) if (isVeiled(state, id, options.enabled(), now)) count++;
			return count;
		},
		get holdsAny() {
			return onScreen.size > 0;
		},
		// Called from a veil's effect: reading the map there would make that effect depend on
		// it, and its own write would run it again, for ever.
		register(id) {
			untrack(() => onScreen.set(id, (onScreen.get(id) ?? 0) + 1));
			return () =>
				untrack(() => {
					const left = (onScreen.get(id) ?? 1) - 1;
					if (left > 0) onScreen.set(id, left);
					else onScreen.delete(id);
				});
		},
		leftPage() {
			state = leavePage(state);
		}
	};
	setContext(CONTEXT_KEY, veil);
	return veil;
}

/** The veil the app shell provided. */
export function useVeil(): Veil {
	const veil = getContext<Veil | undefined>(CONTEXT_KEY);
	if (!veil) throw new Error('useVeil() needs provideVeil() in the app shell');
	return veil;
}
