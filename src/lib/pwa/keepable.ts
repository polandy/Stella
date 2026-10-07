import { applyAction } from '$app/forms';
import { invalidateAll } from '$app/navigation';
import type { SubmitFunction } from '@sveltejs/kit';
import { ulid } from 'ulid';
import type { JsonCommand } from '../commands/commands';
import { whilePending } from '../sync/pending';
import type { PendingSink } from '../sync/pending-work';
import type { KeptPhoto } from './outbox';
import { outbox } from './outbox.svelte';
import { reachability } from './reachability.svelte';

/*
 * An adding form, saved as a command through the outbox (docs/02 §2.18.1, docs/04
 * ADR-076): the same path whether Stella is in reach or not. In reach, the form waits for the
 * answer — applied, or refused with a reason it shows where the action's own error would be —
 * and an answer that never comes leaves the command kept on the device, as it is when Stella is
 * known to be out of reach. The command's id is what makes that safe: had Stella stored it
 * after all, the kept copy is recognised when it arrives.
 *
 * Fields that are not a command yet (something required left empty) still post to the form's
 * action, which says what is missing. An adapter; what may be kept is the vocabulary's business.
 */

export interface Keepable {
	/** The form's fields as the command they stand for, or null when they are not one. */
	toCommand(data: FormData, id: string): JsonCommand | null;
	/** Who it is about, for showing it away from this page — fixed, or read off the form. */
	about: string | ((data: FormData) => string);
	/** The key the form's action returns its error under; a refusal's reason is shown there. */
	errorKey: string;
	/**
	 * The photos going with it, processed in the browser; none if omitted. Null when they could
	 * not be processed — the page says why, and nothing is saved.
	 */
	photos?(data: FormData): Promise<KeptPhoto[] | null>;
	/** Stella took `command` (the page is already read again): close the form, act on `result`. */
	onApplied(result: unknown, command: JsonCommand): void | Promise<void>;
	/** It was kept rather than sent: close the form, say so. */
	onKept(): void;
	/** Counts the save while it is on its way, for the shell's activity indicator. */
	pending?: PendingSink;
}

const NOTHING_PENDING: PendingSink = { begin() {}, end() {} };

/** The form saving through the outbox; `invalid` handles fields that are not a command. */
export function keepable(keep: Keepable, invalid: SubmitFunction): SubmitFunction {
	return async (input) => {
		const command = keep.toCommand(input.formData, ulid());
		if (!command) return invalid(input);
		input.cancel();

		const photos = keep.photos ? await keep.photos(input.formData) : [];
		if (!photos) return;
		const about = typeof keep.about === 'string' ? keep.about : keep.about(input.formData);
		if (!reachability.reachable) {
			await outbox.add(command, photos, about);
			keep.onKept();
			return;
		}
		await whilePending(keep.pending ?? NOTHING_PENDING, async () => {
			const delivery = await outbox.submit(command, photos, about);
			if (delivery.status === 'refused') {
				// A refused batch also names each refused person, for the form to mark (docs/02 §2.4).
				const refusals = delivery.refusals ? { refusals: delivery.refusals } : {};
				await applyAction({
					type: 'failure',
					status: 400,
					data: { [keep.errorKey]: delivery.reason, ...refusals }
				});
			} else if (delivery.status === 'kept') {
				keep.onKept();
			} else {
				// Clears an error an earlier try left on the form, as a successful action would.
				await applyAction({ type: 'success', status: 200 });
				await invalidateAll();
				await keep.onApplied(delivery.result, command);
			}
		});
	};
}
