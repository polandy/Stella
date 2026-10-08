import { describe, expect, it } from 'bun:test';
import type { Gift } from './gifts';
import {
	convertHeldGifts,
	type HeldGiftNote,
	type HeldGiftTouchpoint,
	type HeldGiftsPort
} from './held-gifts';

/*
 * The one-time conversion of gifts Stella already held as Monica notes and as touchpoints of
 * the dropped kind *gift* (docs/02 §2.25.4). Driven against an in-memory port that behaves like
 * the adapter: each replacement writes its gifts and removes the original together, and a gift
 * whose id is already there is left as it is.
 */

function fakePort(notes: HeldGiftNote[], touchpoints: HeldGiftTouchpoint[]) {
	const gifts = new Map<string, Gift>();
	const state = { notes: [...notes], touchpoints: [...touchpoints], gifts };
	const write = (list: readonly Gift[]) => {
		const fresh = list.filter((g) => !gifts.has(g.id));
		for (const g of fresh) gifts.set(g.id, g);
		return fresh.length;
	};
	const port: HeldGiftsPort = {
		async giftNotes() {
			return [...state.notes];
		},
		async giftTouchpoints() {
			return [...state.touchpoints];
		},
		async replaceNote(noteId, gift) {
			state.notes = state.notes.filter((n) => n.id !== noteId);
			return write([gift]);
		},
		async replaceTouchpoint(interactionId, list) {
			state.touchpoints = state.touchpoints.filter((t) => t.id !== interactionId);
			return write(list);
		}
	};
	return { port, state };
}

const note = (over: Partial<HeldGiftNote> = {}): HeldGiftNote => ({
	id: 'monica:gift:1',
	contactId: 'hilde',
	createdBy: 'anna',
	visibility: 'shared',
	body: '🎁 **Teapot** — offered, 12 October 2023\n\nCast iron\n\nhttps://shop.example/teapot',
	createdAt: 1_000,
	updatedAt: 1_000,
	...over
});

const touchpoint = (over: Partial<HeldGiftTouchpoint> = {}): HeldGiftTouchpoint => ({
	id: 'touch-1',
	contactId: 'hilde',
	participantIds: [],
	createdBy: 'ben',
	visibility: 'private',
	authorLocale: 'de',
	title: 'Wine',
	description: null,
	happenedAt: '2024-05-02',
	createdAt: 2_000,
	updatedAt: 3_000,
	...over
});

function run(port: HeldGiftsPort) {
	const lines: string[] = [];
	const deps = {
		held: port,
		untitled: (locale: string | null) => (locale === 'de' ? 'Geschenk' : 'Gift'),
		log: (line: string) => lines.push(line)
	};
	return { lines, report: () => convertHeldGifts(deps) };
}

describe('convertHeldGifts', () => {
	it('turns a Monica gift note into a gift, keeping its id, author, visibility and stamps', async () => {
		const { port, state } = fakePort([note({ visibility: 'private' })], []);
		const report = await run(port).report();

		expect(state.gifts.get('monica:gift:1')).toEqual({
			id: 'monica:gift:1',
			contactId: 'hilde',
			createdBy: 'anna',
			visibility: 'private',
			state: 'given',
			title: 'Teapot',
			note: 'Cast iron',
			url: 'https://shop.example/teapot',
			givenOn: '2023-10-12',
			occasion: null,
			createdAt: 1_000,
			updatedAt: 1_000
		});
		expect(state.notes).toEqual([]);
		expect(report).toMatchObject({ notesConverted: 1, notesLeft: 0, giftsWritten: 1 });
	});

	it('leaves an edited note and an unparseable one alone, and names both in the log', async () => {
		const edited = note({ id: 'monica:gift:2', updatedAt: 9_000 });
		const rewritten = note({ id: 'monica:gift:3', body: 'Teapot — she loved it' });
		const { port, state } = fakePort([note(), edited, rewritten], []);
		const { lines, report } = run(port);
		const result = await report();

		expect(state.notes.map((n) => n.id)).toEqual(['monica:gift:2', 'monica:gift:3']);
		expect([...state.gifts.keys()]).toEqual(['monica:gift:1']);
		expect(result).toMatchObject({ notesConverted: 1, notesLeft: 2 });
		expect(lines.some((l) => l.includes('monica:gift:2') && l.includes('edited'))).toBe(true);
		expect(lines.some((l) => l.includes('monica:gift:3') && l.includes('unparseable'))).toBe(true);
	});

	it('makes one given gift per person of a gift touchpoint and removes the touchpoint', async () => {
		const { port, state } = fakePort([], [touchpoint({ participantIds: ['otto'] })]);
		const report = await run(port).report();

		expect([...state.gifts.values()]).toEqual([
			{
				id: 'touch-1',
				contactId: 'hilde',
				createdBy: 'ben',
				visibility: 'private',
				state: 'given',
				title: 'Wine',
				note: null,
				url: null,
				givenOn: '2024-05-02',
				occasion: null,
				createdAt: 2_000,
				updatedAt: 3_000
			},
			expect.objectContaining({ id: 'touch-1:otto', contactId: 'otto', title: 'Wine' })
		]);
		expect(state.touchpoints).toEqual([]);
		expect(report).toMatchObject({ touchpointsConverted: 1, giftsWritten: 2 });
	});

	it('names a touchpoint that says nothing in its author’s language', async () => {
		const { port, state } = fakePort([], [touchpoint({ title: null })]);
		await run(port).report();
		expect(state.gifts.get('touch-1')?.title).toBe('Geschenk');
	});

	it('changes nothing on a second run, and says nothing', async () => {
		const { port, state } = fakePort([note()], [touchpoint()]);
		await run(port).report();
		const before = [...state.gifts.values()];

		const { lines, report } = run(port);
		const second = await report();

		expect([...state.gifts.values()]).toEqual(before);
		expect(second).toEqual({
			notesConverted: 0,
			notesLeft: 0,
			touchpointsConverted: 0,
			giftsWritten: 0
		});
		expect(lines).toEqual([]);
	});

	it('writes no gift twice when an original comes back after its gift was made', async () => {
		const { port, state } = fakePort([note()], [touchpoint()]);
		await run(port).report();
		// A restore of an older archive adds the note and the touchpoint back.
		state.notes.push(note());
		state.touchpoints.push(touchpoint());

		const again = await run(port).report();

		expect(again).toMatchObject({ notesConverted: 1, touchpointsConverted: 1, giftsWritten: 0 });
		expect(state.gifts.size).toBe(2);
		expect(state.notes).toEqual([]);
		expect(state.touchpoints).toEqual([]);
	});

	it('logs a summary of what it converted', async () => {
		const { port } = fakePort([note()], [touchpoint()]);
		const { lines, report } = run(port);
		await report();
		expect(lines.at(-1)).toContain('1 Monica gift note');
		expect(lines.at(-1)).toContain('1 gift touchpoint');
	});
});
