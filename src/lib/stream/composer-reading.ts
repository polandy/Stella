import type { MomentDraft } from '$lib/people/story-forms';
import { allowedForAudience } from '$lib/mentions/audience';
import {
	createHandleResolver,
	resolveMentions,
	type MentionCandidate
} from '$lib/mentions/mentions';
import { pickableBeside, suggest, type ActiveHandle } from '$lib/mentions/picker';
import { newPeopleAsCandidates, toStored } from '$lib/mentions/picks';
import { unclearHandles, type UnclearHandle } from '$lib/mentions/unclear';
import type { PersonContext } from '$lib/people/context';
import type { ComposerCandidate, ComposerState, PickerRow } from './composer-state';

/*
 * What the composer's state reads as (docs/02 §2.22.1): whom the @-list may offer, its rows,
 * the people the text references — the way the server will read it — and whether it can be
 * saved. Pure; `MomentComposer` derives each of these from its state.
 */

export interface ComposerPeople {
	/** Whom the moment's audience may see, without the person whose page it is. */
	audience: readonly ComposerCandidate[];
	/** The people the moment creates, under their placeholder ids. */
	created: readonly MentionCandidate[];
	known: readonly MentionCandidate[];
}

export function composerPeople(
	state: Pick<ComposerState, 'anchorId' | 'visibility' | 'newPeople'>,
	candidates: readonly ComposerCandidate[]
): ComposerPeople {
	const audience = allowedForAudience(
		[...pickableBeside(candidates, state.anchorId)],
		state.visibility
	);
	const created = newPeopleAsCandidates(state.newPeople);
	return { audience, created, known: [...audience, ...created] };
}

/** The list's rows for the handle under the caret: the people matching it, then a new one. */
export function pickerRows(
	active: ActiveHandle | null,
	known: readonly MentionCandidate[]
): PickerRow[] {
	if (!active) return [];
	const suggestions = suggest(active.query, [...known]);
	return [
		...suggestions.people.map((person) => ({ kind: 'person' as const, person })),
		...(suggestions.create
			? [{ kind: 'create' as const, name: suggestions.create, another: suggestions.createsAnother }]
			: [])
	];
}

export interface ComposerReading {
	/** For the "goes to …'s journal" line: picks by id, anything typed by name. */
	referenced: MentionCandidate[];
	/** A namesake nobody picked, as a question rather than a guess. */
	unclear: UnclearHandle<MentionCandidate>[];
	canSave: boolean;
}

export function composerReading(
	state: Pick<ComposerState, 'body' | 'picks' | 'anchorId' | 'sending'>,
	known: readonly MentionCandidate[],
	contexts: ReadonlyMap<string, PersonContext>
): ComposerReading {
	const stored = toStored(state.body, state.picks);
	const resolved = resolveMentions(stored, createHandleResolver([...known]));
	const referenced = resolved.ids.flatMap((id) => known.filter((c) => c.id === id));
	const unclear = unclearHandles(stored, known, contexts);
	const canSave =
		state.body.trim().length > 0 &&
		(state.anchorId !== null || referenced.length > 0) &&
		unclear.length === 0 &&
		state.sending === null;
	return { referenced, unclear, canSave };
}

/**
 * The day a new moment defaults to. A page kept on the device may be days old, and so is the
 * day it was rendered with: the device's own calendar is the writer's, and it only ever moves
 * the default forward.
 */
export function defaultDay(today: string, deviceDay: string | null): string {
	return deviceDay !== null && deviceDay > today ? deviceDay : today;
}

/** What is typed, in the form it is stored and started from again. */
export function draftOf(
	state: Pick<ComposerState, 'body' | 'picks' | 'visibility' | 'newPeople'>
): MomentDraft {
	return {
		body: toStored(state.body, state.picks),
		visibility: state.visibility,
		newPeople: [...state.newPeople]
	};
}

/** The field emptied for the next moment, under a new name; the share switch stays. */
export function cleared(state: ComposerState, nextCommandId: string): ComposerState {
	return {
		...state,
		body: '',
		picks: [],
		photos: [],
		newPeople: [],
		fresh: state.fresh + 1,
		commandId: nextCommandId
	};
}
