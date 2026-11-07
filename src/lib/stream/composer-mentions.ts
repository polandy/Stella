import type { MomentNewPerson } from '$lib/commands/commands';
import { mentionKey } from '$lib/mentions/mentions';
import { activeHandle, handleFor, insertHandle, type ActiveHandle } from '$lib/mentions/picker';
import {
	isQueuedName,
	newPeopleAsCandidates,
	shiftPicks,
	type MentionPick
} from '$lib/mentions/picks';
import {
	capitalisedIfTypedLowercase,
	isKnownByMoreThanAFirstName,
	splitTypedName
} from '$lib/people/new-person';
import type {
	ComposerCandidate,
	ComposerCommand,
	ComposerState,
	ComposerStep,
	PickerRow
} from './composer-state';

/*
 * The composer's @-mentions (docs/02 §2.22.1): the text carrying its picks across an edit, the
 * list under the caret, a row chosen, and a person created inline. `composerAfter` in
 * `composer-state.ts` routes the events here.
 */

export const only = (state: ComposerState, commands: ComposerCommand[] = []): ComposerStep => ({
	state,
	commands
});

/** The field's new text, carrying the picks across the change. */
export function withText(state: ComposerState, next: string, picked?: MentionPick): ComposerState {
	const picks = shiftPicks(state.body, next, state.picks);
	return { ...state, body: next, picks: picked ? [...picks, picked] : picks };
}

/** Ask the list again for the handle under the caret, from its first row. */
export function withPicker(state: ComposerState, caret: number): ComposerState {
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

export function chosen(
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
export function addCreated(state: ComposerState, key: string): ComposerStep {
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
