import { describe, expect, it } from 'bun:test';
import type { InteractionRow, MomentRow } from '../stream/stream';
import {
	MEMORY_PAGE_LIMITS,
	memoriesOn,
	type MemoryPhoto,
	type MemoryQuery,
	type MemoryRepository
} from './memories';

/*
 * *On this day* over an in-memory port (docs/02 §2.12.1): what is asked of the reads, and how
 * moments, touchpoints and photos come back under their years. The scoping itself — private,
 * archived, another household — is the Drizzle adapter's to prove (`db/memory-repository.test.ts`).
 */

const VIEWER = { id: 'andy', householdId: 'h1' };
const person = (id: string) => ({ id, name: id, avatarPhotoId: null });

const moment = (id: string, entryDate: string, at = 0): MomentRow => ({
	id,
	at,
	actor: { id: 'andy', name: 'Andy' },
	anchor: person('hilde'),
	entryDate,
	visibility: 'shared',
	body: 'Plum cake at Hilde’s',
	mentions: [],
	photoIds: []
});

const touchpoint = (id: string, happenedAt: string, at = 0): InteractionRow => ({
	id,
	at,
	actor: { id: 'andy', name: 'Andy' },
	subject: person('jonas'),
	interactionKind: 'call',
	happenedAt,
	title: null,
	visibility: 'shared',
	participants: []
});

const photo = (id: string, date: string, at = 0): MemoryPhoto => ({
	id,
	date,
	at,
	person: person('karl'),
	visibility: 'shared'
});

function fakeMemories(rows: {
	moments?: MomentRow[];
	touchpoints?: InteractionRow[];
	photos?: MemoryPhoto[];
}): MemoryRepository & { asked: MemoryQuery[] } {
	const asked: MemoryQuery[] = [];
	return {
		asked,
		async momentsOn(_viewer, query) {
			asked.push(query);
			return rows.moments ?? [];
		},
		async touchpointsOn(_viewer, query) {
			asked.push(query);
			return rows.touchpoints ?? [];
		},
		async photosOn(_viewer, query) {
			asked.push(query);
			return rows.photos ?? [];
		}
	};
}

describe('memoriesOn', () => {
	it('asks every kind for the day and month, before the day itself', async () => {
		const memories = fakeMemories({});
		await memoriesOn({ memories }, VIEWER, '2026-11-01');
		expect(memories.asked).toEqual([
			{ days: ['11-01'], before: '2026-11-01', limit: MEMORY_PAGE_LIMITS.entries },
			{ days: ['11-01'], before: '2026-11-01', limit: MEMORY_PAGE_LIMITS.entries },
			{ days: ['11-01'], before: '2026-11-01', limit: MEMORY_PAGE_LIMITS.photos }
		]);
	});

	it('asks for 29 February too on 28 February of a common year', async () => {
		const memories = fakeMemories({});
		await memoriesOn({ memories }, VIEWER, '2027-02-28', { entries: 4, photos: 5 });
		expect(memories.asked.map((q) => [q.days, q.limit])).toEqual([
			[['02-28', '02-29'], 4],
			[['02-28', '02-29'], 4],
			[['02-28', '02-29'], 5]
		]);
	});

	it('puts moments and touchpoints under their years, newest year first', async () => {
		const memories = fakeMemories({
			moments: [moment('m1', '2025-11-01', 1), moment('m2', '2021-11-01')],
			touchpoints: [touchpoint('t1', '2025-11-01', 2)]
		});
		const { years } = await memoriesOn({ memories }, VIEWER, '2026-11-01');
		expect(years.map((y) => [y.yearsAgo, y.items.map((i) => [i.kind, i.id, i.date])])).toEqual([
			[
				1,
				[
					['touchpoint', 't1', '2025-11-01'],
					['moment', 'm1', '2025-11-01']
				]
			],
			[5, [['moment', 'm2', '2021-11-01']]]
		]);
	});

	it('groups the photos by year apart from the entries', async () => {
		const memories = fakeMemories({
			photos: [
				photo('p1', '2024-11-01', 1),
				photo('p2', '2025-11-01'),
				photo('p3', '2024-11-01', 2)
			]
		});
		const { years, photos } = await memoriesOn({ memories }, VIEWER, '2026-11-01');
		expect(years).toEqual([]);
		expect(photos.map((y) => [y.year, y.items.map((p) => p.id)])).toEqual([
			[2025, ['p2']],
			[2024, ['p3', 'p1']]
		]);
	});
});
