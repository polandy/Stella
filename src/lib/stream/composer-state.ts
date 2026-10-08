import type { MomentCapturePayload, MomentNewPerson } from '$lib/commands/commands';
import type { MentionAudience } from '$lib/mentions/audience';
import { mentionKey, type MentionCandidate } from '$lib/mentions/mentions';
import { activeHandle, handleFor, insertHandle, type ActiveHandle } from '$lib/mentions/picker';
import {
	isQueuedName,
	newPeopleAsCandidates,
	shiftPicks,
	toEditable,
	type MentionPick
} from '$lib/mentions/picks';
import type { Distinguishable } from '$lib/people/namesakes';
import {
	capitalisedIfTypedLowercase,
	isKnownByMoreThanAFirstName,
	splitTypedName
} from '$lib/people/new-person';
import type { MomentDraft } from '$lib/contacts/story-forms';
import type { KeptPhoto } from '$lib/pwa/outbox';
import { cleared, draftOf } from './composer-reading';
import { sendingAfter, type SendEvent } from './composer-send';

/*
 * What the moment composer is doing (docs/02 §2.22.1): the text and whom its picked handles
 * stand for, the @-list under the caret, a person being created inline, the photos, and a save
 * on its way; saving is answered in `composer-send.ts`. Pure, so which keystroke or answer
 * leads where is tested without a browser. `MomentComposer` holds one of these, renders it, and
 * carries out the commands each event hands back — focus, photo processing, the outbox and
 * `goto` stay with it, since they touch the page or wait on the network.
 */

/** Somebody the author may mention, with what tells namesakes apart. */
export interface ComposerCandidate extends MentionCandidate, Distinguishable {
	firstName: string | null;
	lastName: string | null;
	visibility: MentionAudience;
	avatarPhotoId: string | null;
}

/**
 * Somebody being created from the picker: their name, what to know them by, and where in the
 * text the `@` they came from sits. Open, it stands in for the list.
 */
export interface Creating {
	firstName: string;
	lastName: string;
	description: string;
	at: ActiveHandle;
	caret: number;
}

/** Why the last save did not go through; the component words it. */
export type ComposerError =
	| { kind: 'couldNotKeep' }
	| { kind: 'alreadySending' }
	| { kind: 'saveFailed' }
	| { kind: 'refused'; reason: string };

export interface ComposerState {
	body: string;
	/** Whom each picked handle in the text stands for. */
	picks: readonly MentionPick[];
	newPeople: readonly (string | MomentNewPerson)[];
	visibility: MentionAudience;
	/** The person whose page the moment is written on: it lands in their journal without an `@`. */
	anchorId: string | null;
	/** The command this draft will be saved as; a new one after every save. */
	commandId: string;
	/**
	 * Bumped after a save to start the day and photo fields afresh. `form.reset()` cannot: it
	 * empties the date field's parts instead of returning them to the default day.
	 */
	fresh: number;
	photos: readonly File[];
	/** The handle under the caret, while the list is open for it. */
	active: ActiveHandle | null;
	highlighted: number;
	creating: Creating | null;
	/** The moment as Save found it, until the save has settled. */
	sending: MomentCapturePayload | null;
	error: ComposerError | null;
}

export type PickerRow =
	{ kind: 'person'; person: MentionCandidate } | { kind: 'create'; name: string; another: boolean };

export type ComposerEvent =
	/** The field's text changed, the caret where it ended up. */
	| { type: 'typed'; text: string; caret: number }
	/** A click or an arrow key may have entered or left an @-handle. */
	| { type: 'caretMoved'; caret: number }
	| { type: 'pickerClosed' }
	| { type: 'highlighted'; index: number }
	| { type: 'highlightMoved'; by: 1 | -1; rows: number }
	/** `audience`: whom the list could offer, for a namesake of somebody being created. */
	| { type: 'rowChosen'; row: PickerRow; caret: number; audience: readonly ComposerCandidate[] }
	| { type: 'createEdited'; field: 'firstName' | 'lastName' | 'description'; value: string }
	/** `key`: the new person's name until Stella has them. */
	| { type: 'createAdded'; key: string }
	| { type: 'createCancelled' }
	| { type: 'visibilitySet'; visibility: MentionAudience }
	| { type: 'photosPicked'; files: readonly File[] }
	| { type: 'cancelled'; nextCommandId: string }
	| SendEvent;

/** What the component carries out after an event, in order. */
export type ComposerCommand =
	/** Focus the field, with the caret at `caret` when it is a number. */
	| { kind: 'focusText'; caret: number | null }
	| { kind: 'focusCreate' }
	/** Downscale and strip the photos; answered by `photosPrepared`. */
	| { kind: 'preparePhotos'; files: readonly File[] }
	/** Keep the moment in the outbox; answered by `keptOnDevice` or `keepFailed`. */
	| { kind: 'keep'; id: string; payload: MomentCapturePayload; photos: KeptPhoto[] }
	/** Send it through the outbox; answered by `answered`. */
	| { kind: 'submit'; id: string; payload: MomentCapturePayload; photos: KeptPhoto[] }
	/** Save an edit into the kept moment `id`; answered by `revised`. */
	| { kind: 'revise'; id: string; payload: MomentCapturePayload }
	| { kind: 'backToStream'; href: string }
	| { kind: 'onSaved' }
	| { kind: 'onKept' }
	| { kind: 'onEditDone' }
	| { kind: 'onCancel'; draft: MomentDraft };

export interface ComposerStep {
	state: ComposerState;
	commands: ComposerCommand[];
}

export interface ComposerOpening {
	candidates: readonly ComposerCandidate[];
	/** A moment kept on this device, open for editing before it is sent. */
	kept: MomentCapturePayload | null;
	/** A draft the page held while the spot showed another form. */
	held: MomentDraft | null;
	/** Body to start from without either: after a failed submit, or a person to write about. */
	draft: string | null;
	anchorId: string | null;
	commandId: string;
}

/** A kept moment and a draft are stored text: picked people come back as picks. */
export function composerAtOpen(at: ComposerOpening): ComposerState {
	const startFrom = at.kept ?? at.held;
	const newPeople = startFrom ? [...startFrom.newPeople] : [];
	const people = [...at.candidates, ...newPeopleAsCandidates(newPeople)];
	const start = toEditable(startFrom?.body ?? at.draft ?? '', (id) => {
		const person = people.find((c) => c.id === id);
		return person ? handleFor(person) : null;
	});
	return {
		body: start.text,
		picks: start.picks,
		newPeople,
		visibility: startFrom?.visibility ?? 'shared',
		// A kept moment written on a person's page stays theirs, wherever it is opened again.
		anchorId: at.anchorId ?? at.kept?.anchorId ?? null,
		commandId: at.commandId,
		fresh: 0,
		photos: [],
		active: null,
		highlighted: 0,
		creating: null,
		sending: null,
		error: null
	};
}

const only = (state: ComposerState, commands: ComposerCommand[] = []): ComposerStep => ({
	state,
	commands
});

/** The field's new text, carrying the picks across the change. */
function withText(state: ComposerState, next: string, picked?: MentionPick): ComposerState {
	const picks = shiftPicks(state.body, next, state.picks);
	return { ...state, body: next, picks: picked ? [...picks, picked] : picks };
}

/** Ask the list again for the handle under the caret, from its first row. */
function withPicker(state: ComposerState, caret: number): ComposerState {
	return { ...state, active: activeHandle(state.body, caret), highlighted: 0 };
}

/** Write `handle` over the `@` at `at`, close the list, and put the caret after it. */
function inserted(
	state: ComposerState,
	handle: string,
	at: ActiveHandle,
	caret: number,
	picked?: MentionPick
): ComposerStep {
	const r = insertHandle(state.body, at, caret, handle);
	return only({ ...withText(state, r.text, picked), active: null }, [
		{ kind: 'focusText', caret: r.caret }
	]);
}

/** Open the panel for a new person, named as typed — or as the namesake is, when there is one. */
function openCreate(
	state: ComposerState,
	typed: string,
	at: ActiveHandle,
	caret: number,
	audience: readonly ComposerCandidate[]
): ComposerStep {
	const namesake = audience.find((c) => mentionKey(c.displayName) === mentionKey(typed));
	const asTyped = splitTypedName(typed);
	const name = namesake?.firstName
		? { firstName: namesake.firstName, lastName: '' }
		: { ...asTyped, firstName: capitalisedIfTypedLowercase(asTyped.firstName) };
	const creating = {
		firstName: name.firstName,
		lastName: name.lastName,
		description: '',
		at,
		caret
	};
	return only({ ...state, creating, active: null }, [{ kind: 'focusCreate' }]);
}

function chosen(
	state: ComposerState,
	row: PickerRow,
	caret: number,
	audience: readonly ComposerCandidate[]
): ComposerStep {
	const { active } = state;
	if (!active) return only(state);
	if (row.kind === 'create') return openCreate(state, row.name, active, caret, audience);
	const handle = handleFor(row.person);
	// A name an older build queued has no id or placeholder; the server finds it by name.
	const picked = isQueuedName(row.person.id)
		? undefined
		: { start: active.start, end: active.start + handle.length, id: row.person.id };
	return inserted(state, handle, active, caret, picked);
}

/** Queue the new person with the moment and mention them by their placeholder. */
function addCreated(state: ComposerState, key: string): ComposerStep {
	const { creating } = state;
	// Stella refuses a first name alone (docs/02 §2.2.3); the button says so by staying off.
	if (!creating || !creating.firstName.trim() || !isKnownByMoreThanAFirstName(creating))
		return only(state);
	const person: MomentNewPerson = {
		key,
		firstName: creating.firstName.trim(),
		lastName: creating.lastName.trim() || null,
		description: creating.description.trim() || null
	};
	const [candidate] = newPeopleAsCandidates([person]);
	const handle = handleFor(candidate);
	const { at, caret } = creating;
	const added = { ...state, newPeople: [...state.newPeople, person], creating: null };
	return inserted(added, handle, at, caret, {
		start: at.start,
		end: at.start + handle.length,
		id: candidate.id
	});
}

/** The state after `event`, and what the component is to do about it. */
export function composerAfter(state: ComposerState, event: ComposerEvent): ComposerStep {
	switch (event.type) {
		case 'typed':
			return only(withPicker(withText(state, event.text), event.caret));
		case 'caretMoved':
			return only(withPicker(state, event.caret));
		case 'pickerClosed':
			return only({ ...state, active: null });
		case 'highlighted':
			return only({ ...state, highlighted: event.index });
		case 'highlightMoved':
			return only({
				...state,
				highlighted: (state.highlighted + event.by + event.rows) % event.rows
			});
		case 'rowChosen':
			return chosen(state, event.row, event.caret, event.audience);
		case 'createEdited':
			if (!state.creating) return only(state);
			return only({ ...state, creating: { ...state.creating, [event.field]: event.value } });
		case 'createAdded':
			return addCreated(state, event.key);
		case 'createCancelled':
			return only({ ...state, creating: null }, [
				{ kind: 'focusText', caret: state.creating?.caret ?? null }
			]);
		case 'visibilitySet':
			return only({ ...state, visibility: event.visibility });
		case 'photosPicked':
			return only({ ...state, photos: [...event.files] });
		case 'cancelled':
			return only(cleared(state, event.nextCommandId), [
				{ kind: 'onCancel', draft: draftOf(state) }
			]);
		default:
			return sendingAfter(state, event);
	}
}
