import { afterNavigate, beforeNavigate, goto, invalidate, invalidateAll } from '$app/navigation';
import { outbox } from '$lib/pwa/outbox.svelte';
import { reachability } from '$lib/pwa/reachability.svelte';
import { refreshPeopleIfChanged, shellReloads } from '$lib/sync/people-freshness';
import type { Removals } from '$lib/undo/context.svelte';
import { navigationTurns } from '$lib/undo/navigation-turns';
import { onMount, untrack } from 'svelte';

/*
 * What keeps the app shell current while it stays open across navigations: the people every
 * picker reads, the removals held back for an undo, and the moments kept on this device.
 * Called once while the layout initialises, so the navigation hooks register with it.
 */

export interface ShellLifecycle {
	/** Read on every call: the layout's data changes under it. */
	data(): { userId: string; people: unknown; peopleStamp: string };
	removals: Removals;
	/** The outbox's messages, in the viewer's language. */
	outboxPhrases: { photoTooLarge: string; earlierVersion: string };
}

export function keepShellCurrent({ data, removals, outboxPhrases }: ShellLifecycle): void {
	/*
	 * The people every picker reads come with the shell, which a client-side navigation keeps,
	 * and so does a tab left open while someone else adds a person. After a navigation, and
	 * whenever the tab comes back into view, they are reloaded if anyone changed them
	 * (docs/04 §4.9).
	 */
	const refreshPeople = () =>
		void refreshPeopleIfChanged(
			{
				fetchStamp: async () => {
					const answer = await fetch('/api/people/stamp');
					if (!answer.ok) throw new Error(`people stamp: ${answer.status}`);
					return ((await answer.json()) as { stamp: string }).stamp;
				},
				reload: () => invalidate('app:people')
			},
			data().peopleStamp
		);
	// A navigation that reloaded the shell (a form submit, an invalidation) is fresh already.
	const shell = shellReloads(untrack(() => data().people));
	afterNavigate((navigation) => {
		if (shell.reloadedSinceLastLook(data().people)) return;
		if (navigation.type !== 'enter') refreshPeople();
	});

	// Removals are held back for an undo window (docs/04 §4.9). Leaving the page ends the
	// window: a client-side navigation waits for the requests so the next screen cannot read
	// the item back; an unload — or a native form post, which must not be replayed as a GET —
	// sends them with keepalive alongside and hopes for the best.
	const turns = navigationTurns();
	beforeNavigate((navigation) => {
		// Taken for every navigation, so a newer one retires any held back below.
		const stillLatest = turns.take();
		if (removals.snapshot.removals.length === 0) return;
		if (navigation.type === 'leave' || navigation.type === 'form' || !navigation.to) {
			void removals.flush();
			return;
		}
		const { to, type, delta } = navigation;
		navigation.cancel();
		void removals.flush().then(() => {
			if (!stillLatest()) return;
			if (type === 'popstate' && delta) history.go(delta);
			else void goto(to.url);
		});
	});
	onMount(() => {
		const flush = () => void removals.flush();
		window.addEventListener('pagehide', flush);
		return () => window.removeEventListener('pagehide', flush);
	});

	/*
	 * What this member saved while Stella was out of reach (docs/02 §2.18.1) is sent when the app
	 * opens, when Stella answers again, when the tab comes back into view and when the device
	 * joins a network — never on a timer. What Stella took is read back by reloading the page's
	 * data.
	 */
	onMount(() => {
		void outbox
			.start(data().userId, () => void invalidateAll(), outboxPhrases)
			.catch(() => {
				// No IndexedDB (a private window in some browsers): nothing can have been kept.
			});
		const onVisible = () => {
			if (document.visibilityState !== 'visible') return;
			void outbox.refresh().then(() => outbox.send());
			refreshPeople();
		};
		// A hint, not proof: it fires when the phone joins a network — the home Wi-Fi, say.
		const onOnline = () => void outbox.send();
		document.addEventListener('visibilitychange', onVisible);
		window.addEventListener('online', onOnline);
		return () => {
			document.removeEventListener('visibilitychange', onVisible);
			window.removeEventListener('online', onOnline);
		};
	});
	$effect(() => {
		if (reachability.reachable) void outbox.send();
	});
}
