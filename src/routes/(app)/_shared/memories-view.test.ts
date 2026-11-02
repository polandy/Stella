import { describe, expect, it } from 'bun:test';
import type { Memory, MemoryPhoto } from '$lib/server/domain/memories/memories';
import { memoryBandForView, memoryRowOf, memoryYearsForView } from './memories-view';

/* *On this day* rows (docs/02 §2.12.1): faces, the first line, the link and the veil key. */

const hilde = { id: 'hilde', name: 'Hilde', avatarPhotoId: null };
const karl = { id: 'karl', name: 'Karl', avatarPhotoId: 'k.jpg' };
const actor = { id: 'u1', name: 'Andy' };

const moment = (over: Partial<Extract<Memory, { kind: 'moment' }>> = {}): Memory => ({
	kind: 'moment',
	id: 'm1',
	at: 1,
	date: '2024-11-01',
	actor,
	anchor: hilde,
	entryDate: '2024-11-01',
	visibility: 'shared',
	body: '**Kuchen** mit @{contact:karl} im Garten',
	mentions: [karl],
	photoIds: [],
	...over
});

const touchpoint = (over: Partial<Extract<Memory, { kind: 'touchpoint' }>> = {}): Memory => ({
	kind: 'touchpoint',
	id: 't1',
	at: 1,
	date: '2023-11-01',
	actor,
	subject: hilde,
	interactionKind: 'call',
	happenedAt: '2023-11-01',
	title: null,
	visibility: 'private',
	participants: [hilde, karl],
	...over
});

describe('memoryRowOf', () => {
	it('reads a moment as its first line, opening its entry on the journal page', () => {
		expect(memoryRowOf(moment())).toMatchObject({
			kind: 'moment',
			people: [hilde, karl],
			line: 'Kuchen mit @Karl im Garten',
			href: '/contacts/hilde/journal#entry-m1',
			veilId: 'journal:m1',
			isPrivate: false
		});
	});

	it('reads a mention the viewer may not see as the neutral marker', () => {
		expect(memoryRowOf(moment({ mentions: [] })).line).toBe('Kuchen mit @unknown im Garten');
	});

	it('reads a touchpoint by its title, or leaves the line to its kind', () => {
		const row = memoryRowOf(touchpoint());
		expect(row).toMatchObject({
			kind: 'touchpoint',
			people: [hilde, karl],
			line: null,
			interactionKind: 'call',
			href: '/contacts/hilde#section-story',
			veilId: 'interaction:t1',
			isPrivate: true
		});
		expect(memoryRowOf(touchpoint({ title: 'Geburtstag' })).line).toBe('Geburtstag');
	});
});

describe('memoryYearsForView', () => {
	const photo = (id: string, date: string): MemoryPhoto => ({
		id,
		date,
		at: 0,
		person: hilde,
		visibility: 'shared'
	});

	it('makes one card per year with an entry or a photo, newest first', () => {
		const cards = memoryYearsForView(
			[{ year: 2023, yearsAgo: 3, items: [touchpoint()] }],
			[
				{ year: 2024, yearsAgo: 2, items: [photo('p1', '2024-11-01')] },
				{ year: 2023, yearsAgo: 3, items: [photo('p2', '2023-11-01')] }
			]
		);
		expect(cards.map((c) => [c.year, c.rows.length, c.photos.map((p) => p.id)])).toEqual([
			[2024, 0, ['p1']],
			[2023, 1, ['p2']]
		]);
	});
});

describe('memoryBandForView', () => {
	const photo = (id: string): MemoryPhoto => ({
		id,
		date: '2024-11-01',
		at: 0,
		person: hilde,
		visibility: 'shared'
	});

	it('strips the photos across years and keeps three rows', () => {
		const band = memoryBandForView({
			years: [
				{ year: 2024, yearsAgo: 2, items: [moment({ id: 'a' }), moment({ id: 'b' })] },
				{ year: 2023, yearsAgo: 3, items: [touchpoint({ id: 'c' }), touchpoint({ id: 'd' })] }
			],
			photos: [
				{ year: 2024, yearsAgo: 2, items: [photo('p1'), photo('p2')] },
				{ year: 2022, yearsAgo: 4, items: [photo('p3')] }
			]
		});
		expect(band.years.map((y) => y.rows.map((r) => r.id))).toEqual([['a', 'b'], ['c']]);
		expect(band.photos.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
		expect(band).toMatchObject({ more: true, empty: false });
	});
});
