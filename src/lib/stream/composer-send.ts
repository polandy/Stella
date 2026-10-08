import type { MomentCapturePayload } from '$lib/commands/commands';
import { toStored } from '$lib/mentions/picks';
import type { Delivery, KeptPhoto } from '$lib/pwa/outbox';
import { cleared } from './composer-reading';
import type { ComposerCommand, ComposerState, ComposerStep } from './composer-state';
import { linkHintHref } from './link-hint';

/*
 * Saving a moment (docs/02 §2.18.1, docs/04 ADR-076): the part of `composer-state.ts` from Save
 * to Stella's answer. With JavaScript a moment always goes through the outbox, named once per
 * draft: in reach it waits for the answer, out of reach it is kept on the device. A moment whose
 * answer was lost on the way is recognised by its name when it arrives a second time, so the
 * name only changes once the draft is done with — saved, kept, or refused. Pure.
 */

export type SendEvent =
	/** Save, with the day the form says; `editing` names the kept moment being edited. */
	| { type: 'submitted'; entryDate: string; editing: string | null }
	/** The photos are processed; `reachable` is whether Stella answers right now. */
	| { type: 'photosPrepared'; photos: KeptPhoto[]; reachable: boolean }
	| { type: 'keptOnDevice'; nextCommandId: string }
	| { type: 'keepFailed' }
	| { type: 'revised'; saved: boolean; nextCommandId: string }
	/** `inPlace`: the page takes the saved moment itself rather than going back to the stream. */
	| { type: 'answered'; delivery: Delivery; inPlace: boolean; nextCommandId: string }
	/** The save is over, `failed` when something on its way threw. */
	| { type: 'settled'; failed: boolean };

const only = (state: ComposerState, commands: ComposerCommand[] = []): ComposerStep => ({
	state,
	commands
});

/** What the form says, as the command's payload. */
function payloadOf(state: ComposerState, entryDate: string): MomentCapturePayload {
	return {
		body: toStored(state.body, state.picks).trim(),
		entryDate,
		visibility: state.visibility,
		newPeople: [...state.newPeople],
		...(state.anchorId ? { anchorId: state.anchorId } : {})
	};
}

function submitted(state: ComposerState, entryDate: string, editing: string | null): ComposerStep {
	const payload = payloadOf(state, entryDate);
	const sending = { ...state, sending: payload, error: null };
	if (editing) return only(sending, [{ kind: 'revise', id: editing, payload }]);
	// Processed once per save, so a save that ends up kept sends the very same photos.
	return only(sending, [{ kind: 'preparePhotos', files: state.photos }]);
}

function answered(state: ComposerState, event: Extract<SendEvent, { type: 'answered' }>) {
	const { delivery } = event;
	if (delivery.status === 'refused') {
		// The text stays in the field, to be corrected and saved as a new moment.
		const error = { kind: 'refused' as const, reason: delivery.reason };
		return only({ ...state, error, commandId: event.nextCommandId });
	}
	const next = cleared(state, event.nextCommandId);
	if (delivery.status === 'kept') return only(next, [{ kind: 'onKept' }]);
	if (event.inPlace) return only(next, [{ kind: 'onSaved' }]);
	// Back to the stream, offering to link the first two people in it (§2.22.1).
	const { linkSuggestion } = delivery.result as { linkSuggestion: [string, string] | null };
	return only(next, [{ kind: 'backToStream', href: linkHintHref(linkSuggestion) }]);
}

export function sendingAfter(state: ComposerState, event: SendEvent): ComposerStep {
	switch (event.type) {
		case 'submitted':
			return submitted(state, event.entryDate, event.editing);
		case 'photosPrepared': {
			if (!state.sending) return only(state);
			const command = { id: state.commandId, payload: state.sending, photos: event.photos };
			return only(state, [{ kind: event.reachable ? 'submit' : 'keep', ...command }]);
		}
		case 'keptOnDevice':
			return only(cleared(state, event.nextCommandId), [{ kind: 'onKept' }]);
		case 'keepFailed':
			// The text stays in the field: nothing is half-saved.
			return only({ ...state, error: { kind: 'couldNotKeep' } });
		case 'revised':
			if (!event.saved) return only({ ...state, error: { kind: 'alreadySending' } });
			return only(cleared(state, event.nextCommandId), [{ kind: 'onEditDone' }]);
		case 'answered':
			return answered(state, event);
		case 'settled':
			return only({
				...state,
				sending: null,
				error: event.failed ? { kind: 'saveFailed' } : state.error
			});
	}
}
