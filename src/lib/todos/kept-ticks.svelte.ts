import { isKept, type KeptOf } from '$lib/pwa/outbox';
import { outbox } from '$lib/pwa/outbox.svelte';

/*
 * The browser side of a tick kept on the device while Stella was out of reach (docs/02 §2.18):
 * every list of to-dos strikes such a row through and offers *Undo* until it is sent.
 */

/** The ticks kept on this device and not sent yet, by to-do (reactive). */
export function keptTicks(): Map<string, KeptOf<'todo.tick'>> {
	return new Map(
		outbox.mine
			.filter((item): item is KeptOf<'todo.tick'> => isKept(item, 'todo.tick'))
			.map((item) => [item.command.payload.todoId, item])
	);
}

/** *Undo* for a kept tick: it is dropped on the device and never sent; `onGone` if too late. */
export function recallKeptTick(commandId: string, onGone: () => void): void {
	void outbox.discard(commandId).then((recalled) => {
		if (!recalled) onGone();
	});
}
