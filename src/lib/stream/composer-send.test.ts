import { describe, expect, it } from 'bun:test';
import type { MomentCapturePayload } from '$lib/commands/commands';
import type { KeptPhoto } from '$lib/pwa/outbox';
import {
	composerAfter,
	composerAtOpen,
	type ComposerCommand,
	type ComposerEvent,
	type ComposerState
} from './composer-state';
import { linkHintHref } from './link-hint';

/*
 * Saving a moment (docs/02 §2.18.1, §2.22.1): online it waits for Stella's answer, out of reach
 * it is kept in the outbox, a refusal keeps the draft, and a save starts the field afresh.
 */

const anna = {
	id: 'anna',
	displayName: 'Anna',
	firstName: 'Anna',
	lastName: 'Muster',
	visibility: 'shared' as const,
	avatarPhotoId: null
};

const opened = (anchorId: string | null = null) =>
	composerAtOpen({
		candidates: [anna],
		kept: null,
		held: { body: '@{contact:anna} came for tea ', visibility: 'shared', newPeople: [] },
		draft: null,
		anchorId,
		commandId: 'cmd-1'
	});

function run(state: ComposerState, ...events: ComposerEvent[]) {
	const commands: ComposerCommand[] = [];
	for (const event of events) {
		const next = composerAfter(state, event);
		state = next.state;
		commands.push(...next.commands);
	}
	return { state, commands };
}

const photo = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
const processed: KeptPhoto = {
	id: 'p1',
	image: photo,
	thumb: photo,
	width: 1,
	height: 1,
	takenAt: null
};
const payload: MomentCapturePayload = {
	body: '@{contact:anna} came for tea',
	entryDate: '2026-10-05',
	visibility: 'shared',
	newPeople: []
};
const submitted: ComposerEvent = { type: 'submitted', entryDate: '2026-10-05', editing: null };
const prepared = (reachable: boolean): ComposerEvent => ({
	type: 'photosPrepared',
	photos: [processed],
	reachable
});
const applied = (inPlace: boolean): ComposerEvent => ({
	type: 'answered',
	delivery: { status: 'applied', result: { linkSuggestion: ['anna', 'bob'] } },
	inPlace,
	nextCommandId: 'cmd-2'
});
const settled: ComposerEvent = { type: 'settled', failed: false };
const withPhoto = () => run(opened(), { type: 'photosPicked', files: [photo] }).state;

describe('submitting', () => {
	it('processes the picked photos first, the stored text as it was when Save was pressed', () => {
		const { state, commands } = run(withPhoto(), submitted);
		expect(state.sending).toEqual(payload);
		expect(commands).toEqual([{ kind: 'preparePhotos', files: [photo] }]);
	});

	it('names the person page the moment belongs to', () => {
		const { state } = run(opened('bob'), submitted);
		expect(state.sending).toEqual({ ...payload, anchorId: 'bob' });
	});

	it('clears the last error', () => {
		const failed = run(opened(), submitted, { type: 'settled', failed: true }).state;
		expect(failed.error).toEqual({ kind: 'saveFailed' });
		expect(run(failed, submitted).state.error).toBeNull();
	});
});

describe('online', () => {
	it('sends the moment under its name, with its photos', () => {
		const { commands } = run(withPhoto(), submitted, prepared(true));
		expect(commands.at(-1)).toEqual({ kind: 'submit', id: 'cmd-1', payload, photos: [processed] });
	});

	it('goes back to the stream offering to link the first two, and starts afresh', () => {
		const { state, commands } = run(withPhoto(), submitted, prepared(true), applied(false));
		expect(commands.at(-1)).toEqual({ kind: 'backToStream', href: linkHintHref(['anna', 'bob']) });
		expect(state).toMatchObject({ body: '', picks: [], photos: [], commandId: 'cmd-2', fresh: 1 });
		// Still saving until the stream is there.
		expect(state.sending).not.toBeNull();
		expect(run(state, settled).state.sending).toBeNull();
	});

	it('stays on a person’s page, telling the page', () => {
		const { commands } = run(opened(), submitted, prepared(true), applied(true));
		expect(commands.at(-1)).toEqual({ kind: 'onSaved' });
	});

	it('tells the page when the answer was lost and the moment kept', () => {
		const { state, commands } = run(opened(), submitted, prepared(true), {
			type: 'answered',
			delivery: { status: 'kept' },
			inPlace: false,
			nextCommandId: 'cmd-2'
		});
		expect(commands.at(-1)).toEqual({ kind: 'onKept' });
		expect(state.body).toBe('');
	});

	it('keeps the draft on a refusal, to be saved as a new moment', () => {
		const before = withPhoto();
		const { state, commands } = run(
			before,
			submitted,
			prepared(true),
			{
				type: 'answered',
				delivery: { status: 'refused', reason: 'Too long' },
				inPlace: false,
				nextCommandId: 'cmd-2'
			},
			settled
		);
		expect(commands.at(-1)?.kind).toBe('submit');
		expect(state).toMatchObject({ body: before.body, picks: before.picks, photos: [photo] });
		expect(state.error).toEqual({ kind: 'refused', reason: 'Too long' });
		expect(state.commandId).toBe('cmd-2');
		expect(state.sending).toBeNull();
	});

	it('keeps the draft when photo processing or the round trip throws', () => {
		const before = withPhoto();
		const { state } = run(before, submitted, { type: 'settled', failed: true });
		expect(state).toMatchObject({ body: before.body, photos: [photo], commandId: 'cmd-1' });
		expect(state.error).toEqual({ kind: 'saveFailed' });
		expect(state.sending).toBeNull();
	});
});

describe('out of reach', () => {
	it('keeps the moment and its photos in the outbox', () => {
		const { commands } = run(withPhoto(), submitted, prepared(false));
		expect(commands.at(-1)).toEqual({ kind: 'keep', id: 'cmd-1', payload, photos: [processed] });
	});

	it('starts afresh once kept, and tells the page', () => {
		const { state, commands } = run(withPhoto(), submitted, prepared(false), {
			type: 'keptOnDevice',
			nextCommandId: 'cmd-2'
		});
		expect(commands.at(-1)).toEqual({ kind: 'onKept' });
		expect(state).toMatchObject({ body: '', photos: [], commandId: 'cmd-2', fresh: 1 });
	});

	it('keeps the text in the field when the device refuses to keep it', () => {
		const before = opened();
		const { state } = run(before, submitted, prepared(false), { type: 'keepFailed' }, settled);
		expect(state.body).toBe(before.body);
		expect(state.error).toEqual({ kind: 'couldNotKeep' });
	});
});

describe('editing a kept moment', () => {
	const editing: ComposerEvent = { type: 'submitted', entryDate: '2026-10-05', editing: 'kept-1' };

	it('saves into the kept moment it came from, photos untouched', () => {
		const { commands } = run(opened(), editing);
		expect(commands).toEqual([{ kind: 'revise', id: 'kept-1', payload }]);
	});

	it('closes once saved', () => {
		const { state, commands } = run(opened(), editing, {
			type: 'revised',
			saved: true,
			nextCommandId: 'cmd-2'
		});
		expect(commands.at(-1)).toEqual({ kind: 'onEditDone' });
		expect(state.body).toBe('');
	});

	it('says so when the moment is already on its way', () => {
		const before = opened();
		const { state } = run(before, editing, {
			type: 'revised',
			saved: false,
			nextCommandId: 'cmd-2'
		});
		expect(state.error).toEqual({ kind: 'alreadySending' });
		expect(state.body).toBe(before.body);
	});
});

describe('reset after saving', () => {
	it('keeps the share switch, forgets the people created for the saved moment', () => {
		const typed = run(opened(), { type: 'visibilitySet', visibility: 'private' }).state;
		const created = {
			...typed,
			newPeople: [{ key: 'k', firstName: 'Lena', lastName: 'Berg', description: null }]
		};
		const { state } = run(created, submitted, prepared(true), applied(false));
		expect(state.visibility).toBe('private');
		expect(state.newPeople).toEqual([]);
	});
});
