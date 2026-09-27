import type { SubmitFunction } from '@sveltejs/kit';
import { ulid } from 'ulid';
import type { JsonCommand } from '../commands/commands';
import { outbox } from './outbox.svelte';
import { reachability } from './reachability.svelte';

/*
 * An adding form that still works out of reach (docs/concepts/offline-capture.md §4.1). Wraps
 * the form's own `use:enhance` handler: the post is named as a command (`commandId`), and
 * when Stella is known to be out of reach — or the post never got an answer — the same
 * command is kept in the outbox instead of failing. The name is what makes the second case
 * safe: had Stella stored it after all, the kept copy is recognised when it arrives.
 *
 * An adapter; what may be kept is the command vocabulary's business, not this file's.
 */

export interface Keepable {
	/** The form's fields as the command they stand for, or null when they are not one. */
	toCommand(data: FormData, id: string): JsonCommand | null;
	/** Who it is about, for showing it away from this page. */
	about: string;
	/** It was kept rather than sent: close the form, say so. */
	onKept(): void;
}

/** Whether a failed post failed for want of a connection, rather than being answered. */
function unanswered(error: unknown): boolean {
	return error instanceof TypeError;
}

/** `inner`, but keeping the post in the outbox when Stella cannot take it. */
export function keepable(keep: Keepable, inner: SubmitFunction): SubmitFunction {
	return async (input) => {
		const id = ulid();
		input.formData.set('commandId', id);
		const kept = async () => {
			const command = keep.toCommand(input.formData, id);
			if (!command) return false;
			await outbox.add(command, [], keep.about);
			keep.onKept();
			return true;
		};

		if (!reachability.reachable) {
			input.cancel();
			await kept();
			return;
		}
		const after = await inner(input);
		return async (options) => {
			if (options.result.type === 'error' && unanswered(options.result.error) && (await kept())) return;
			if (after) await after(options);
			else await options.update();
		};
	};
}
