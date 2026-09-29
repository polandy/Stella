import { browser } from '$app/environment';
import { ASK_REACHABILITY, isReachabilityReport } from './reachability';

/*
 * Whether Stella answers, as one rune the whole page reads (docs/02 §2.18). The offline line,
 * the composer's *Save for later* and the outbox all follow the same report, so they never
 * disagree about where things stand. An adapter: the protocol is `reachability.ts`.
 *
 * Listened for at module load, like the install prompt, so the report is not missed by
 * whichever component happens to mount first. It starts reachable, so the server render says
 * nothing about being offline; the worker settles it once asked.
 */

let reachable = $state(true);
let keptAt = $state<number | null>(null);

if (browser && 'serviceWorker' in navigator) {
	const worker = navigator.serviceWorker;
	worker.addEventListener('message', (event: MessageEvent) => {
		if (!isReachabilityReport(event.data)) return;
		reachable = event.data.reachable;
		keptAt = event.data.keptAt;
	});
	// The report this page needed was likely sent while it was still loading, so it asks.
	void worker.ready.then(() => worker.controller?.postMessage(ASK_REACHABILITY));
}

/** Where things stand, as a rune. */
export const reachability = {
	get reachable(): boolean {
		return reachable;
	},
	/** When the page on screen was kept, if it came off the device and its age is known. */
	get keptAt(): number | null {
		return keptAt;
	}
};
