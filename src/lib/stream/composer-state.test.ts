import { describe, expect, it } from 'bun:test';
import { newPersonMentionId } from '$lib/commands/commands';
import { handleFor } from '$lib/mentions/picker';
import {
	composerPeople,
	composerReading,
	defaultDay,
	draftOf,
	pickerRows
} from './composer-reading';
import {
	composerAfter,
	composerAtOpen,
	type ComposerCandidate,
	type ComposerCommand,
	type ComposerEvent,
	type ComposerState
} from './composer-state';

/*
 * The moment composer's field (docs/02 §2.22.1): what typing an `@` offers, how a pick or an
 * unclear namesake reads, a person created inline, photos, the day and the share switch. Saving
 * is in `composer-send.test.ts`.
 */

const person = (id: string, displayName: string, more: Partial<ComposerCandidate> = {}) =>
	({
		id,
		displayName,
		firstName: displayName.split(' ')[0],
		lastName: displayName.split(' ')[1] ?? null,
		visibility: 'shared',
		avatarPhotoId: null,
		...more
	}) satisfies ComposerCandidate;

const anna = person('anna', 'Anna Muster');
const thomasWork = person('t1', 'Thomas', { description: 'from work' });
const thomasNext = person('t2', 'Thomas', { description: 'next door' });
const secret = person('sec', 'Sam Secret', { visibility: 'private' });
const candidates = [anna, thomasWork, thomasNext, secret];

const opened = (more: Partial<Parameters<typeof composerAtOpen>[0]> = {}) =>
	composerAtOpen({
		candidates,
		kept: null,
		held: null,
		draft: null,
		anchorId: null,
		commandId: 'cmd-1',
		...more
	});

/** Every event in turn, and every command they asked for, in order. */
function run(state: ComposerState, ...events: ComposerEvent[]) {
	const commands: ComposerCommand[] = [];
	for (const event of events) {
		const next = composerAfter(state, event);
		state = next.state;
		commands.push(...next.commands);
	}
	return { state, commands };
}

const typed = (text: string, caret = text.length): ComposerEvent => ({
	type: 'typed',
	text,
	caret
});

function reading(state: ComposerState) {
	const { known } = composerPeople(state, candidates);
	return composerReading(state, known, new Map());
}

function rows(state: ComposerState) {
	return pickerRows(state.active, composerPeople(state, candidates).known);
}

function choose(state: ComposerState, index: number, caret = state.body.length) {
	const { audience } = composerPeople(state, candidates);
	return run(state, { type: 'rowChosen', row: rows(state)[index], caret, audience });
}

describe('opening', () => {
	it('starts empty and shared, or from what was typed before', () => {
		expect(opened()).toMatchObject({ body: '', picks: [], visibility: 'shared', fresh: 0 });
		const held = {
			body: '@{contact:anna} was here',
			visibility: 'private' as const,
			newPeople: []
		};
		const state = opened({ held });
		expect(state.body).toBe(`${handleFor(anna)} was here`);
		expect(state.picks).toEqual([{ start: 0, end: handleFor(anna).length, id: 'anna' }]);
		expect(state.visibility).toBe('private');
	});

	it('keeps a kept moment’s person page, wherever it is opened again', () => {
		const kept = {
			body: 'tea',
			entryDate: '2026-10-01',
			visibility: 'shared' as const,
			newPeople: [],
			anchorId: 'anna'
		};
		expect(opened({ kept }).anchorId).toBe('anna');
		expect(opened({ kept, anchorId: 't1' }).anchorId).toBe('t1');
	});
});

describe('typing a mention', () => {
	it('opens the list on an @ and offers the people matching it, then a new one', () => {
		const { state } = run(opened(), typed('Tea with @Ann'));
		expect(state.active).toEqual({ start: 9, query: 'Ann' });
		expect(rows(state).map((r) => (r.kind === 'person' ? r.person.id : r.name))).toEqual([
			'anna',
			'Ann'
		]);
	});

	it('writes the picked person’s handle and remembers them against it', () => {
		const { state, commands } = choose(run(opened(), typed('@Ann')).state, 0);
		const handle = handleFor(anna);
		expect(state.body).toBe(`${handle} `);
		expect(state.picks).toEqual([{ start: 0, end: handle.length, id: 'anna' }]);
		expect(state.active).toBeNull();
		expect(commands).toEqual([{ kind: 'focusText', caret: handle.length + 1 }]);
		expect(reading(state).referenced.map((p) => p.id)).toEqual(['anna']);
		expect(reading(state).canSave).toBe(true);
	});

	it('lets a pick go once its name is typed over', () => {
		const picked = choose(run(opened(), typed('@Ann')).state, 0).state;
		const { state } = run(picked, typed(picked.body.replace('Muster', 'M')));
		expect(state.picks).toEqual([]);
	});

	it('moves the highlight round the list, and Escape-style closing forgets it', () => {
		let { state } = run(opened(), typed('@T'));
		const count = rows(state).length;
		state = run(state, { type: 'highlightMoved', by: -1, rows: count }).state;
		expect(state.highlighted).toBe(count - 1);
		state = run(state, { type: 'highlightMoved', by: 1, rows: count }).state;
		expect(state.highlighted).toBe(0);
		expect(run(state, { type: 'pickerClosed' }).state.active).toBeNull();
	});

	it('offers only people the moment’s audience may see', () => {
		const { state } = run(opened(), typed('@Sam'));
		expect(rows(state).filter((r) => r.kind === 'person')).toEqual([]);
		const privately = run(
			state,
			{ type: 'visibilitySet', visibility: 'private' },
			typed('@Sam')
		).state;
		expect(rows(privately)[0]).toEqual({ kind: 'person', person: secret });
	});

	it('never offers the person whose page it is', () => {
		const { state } = run(opened({ anchorId: 'anna' }), typed('@Ann'));
		expect(rows(state).filter((r) => r.kind === 'person')).toEqual([]);
		expect(reading(run(state, typed('tea')).state).canSave).toBe(true);
	});
});

describe('an unclear namesake', () => {
	it('keeps saving off while a typed @Thomas could be either', () => {
		const { state } = run(opened(), typed('@Thomas came'));
		const { unclear, canSave } = reading(state);
		expect(unclear.map((u) => u.handle)).toEqual(['Thomas']);
		expect(unclear[0].people.map((p) => p.person.id)).toEqual(['t1', 't2']);
		expect(canSave).toBe(false);
	});

	it('is resolved by picking one of them from the list', () => {
		const typedThomas = run(opened(), typed('@Thomas')).state;
		const index = rows(typedThomas).findIndex((r) => r.kind === 'person' && r.person.id === 't2');
		const { state } = choose(typedThomas, index);
		expect(reading(state).unclear).toEqual([]);
		expect(reading(state).referenced.map((p) => p.id)).toEqual(['t2']);
		expect(reading(state).canSave).toBe(true);
	});
});

describe('a new person named inline', () => {
	const creatingFrom = (text: string) => {
		const state = run(opened(), typed(text)).state;
		return choose(
			state,
			rows(state).findIndex((r) => r.kind === 'create')
		);
	};

	it('opens the panel named as typed, capitalised, and focuses it', () => {
		const { state, commands } = creatingFrom('@lena');
		expect(state.creating).toMatchObject({ firstName: 'Lena', lastName: '', description: '' });
		expect(state.active).toBeNull();
		expect(commands).toEqual([{ kind: 'focusCreate' }]);
	});

	it('starts from a namesake’s first name when the name is somebody’s already', () => {
		expect(creatingFrom('@Thomas').state.creating?.firstName).toBe('Thomas');
	});

	it('refuses a first name alone', () => {
		const { state, commands } = run(creatingFrom('@Lena').state, {
			type: 'createAdded',
			key: 'k1'
		});
		expect(state.creating).not.toBeNull();
		expect(commands).toEqual([]);
	});

	it('queues them with the moment and mentions them by their placeholder', () => {
		const { state, commands } = run(
			creatingFrom('Saw @Lena').state,
			{ type: 'createEdited', field: 'lastName', value: ' Berg ' },
			{ type: 'createAdded', key: 'k1' }
		);
		expect(state.newPeople).toEqual([
			{ key: 'k1', firstName: 'Lena', lastName: 'Berg', description: null }
		]);
		expect(state.creating).toBeNull();
		expect(state.body).toBe('Saw @LenaBerg ');
		expect(state.picks).toEqual([{ start: 4, end: 13, id: newPersonMentionId('k1') }]);
		expect(commands).toEqual([{ kind: 'focusText', caret: 14 }]);
		expect(rows(run(state, typed(`${state.body}@Len`)).state)[0]).toMatchObject({
			kind: 'person',
			person: { id: newPersonMentionId('k1') }
		});
		expect(draftOf(state).body).toBe(`Saw @{contact:${newPersonMentionId('k1')}} `);
	});

	it('goes back to the text where the @ was when cancelled', () => {
		const { state, commands } = run(creatingFrom('Saw @Lena').state, { type: 'createCancelled' });
		expect(state.creating).toBeNull();
		expect(state.body).toBe('Saw @Lena');
		expect(commands).toEqual([{ kind: 'focusText', caret: 9 }]);
	});
});

describe('photos', () => {
	const photo = new File(['x'], 'a.jpg', { type: 'image/jpeg' });

	it('holds what was picked, and nothing once the pick is emptied', () => {
		const added = run(opened(), { type: 'photosPicked', files: [photo, photo] }).state;
		expect(added.photos).toHaveLength(2);
		expect(run(added, { type: 'photosPicked', files: [] }).state.photos).toEqual([]);
	});
});

describe('the day', () => {
	it('defaults to the later of the device’s day and the page’s', () => {
		expect(defaultDay('2026-10-08', null)).toBe('2026-10-08');
		expect(defaultDay('2026-10-08', '2026-10-10')).toBe('2026-10-10');
		expect(defaultDay('2026-10-08', '2026-10-07')).toBe('2026-10-08');
	});
});

describe('cancelling', () => {
	it('hands back what was typed and starts afresh', () => {
		const typedText = run(opened(), typed('tea'), {
			type: 'visibilitySet',
			visibility: 'private'
		}).state;
		const { state, commands } = run(typedText, { type: 'cancelled', nextCommandId: 'cmd-2' });
		expect(commands).toEqual([
			{ kind: 'onCancel', draft: { body: 'tea', visibility: 'private', newPeople: [] } }
		]);
		expect(state).toMatchObject({ body: '', picks: [], commandId: 'cmd-2', fresh: 1 });
	});
});
