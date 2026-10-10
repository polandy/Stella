import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { eq } from 'drizzle-orm';
import { ADMIN, AUTHOR, MEMBER, removalDb } from '../domain/testing/removal-db';
import type { Viewer } from '../access/visibility';
import {
	lastContactedOn,
	listInteractions,
	logInteraction,
	type InteractionAuthor
} from '../domain/interactions/interactions';
import { systemClock } from '../clock';
import { createDrizzleInteractionRepository } from './interaction-repository';
import * as schema from './schema';

/*
 * Integration spec for the interaction Drizzle adapter: child-record scoping (§3.7) — a
 * private interaction, or any interaction on a private contact, is only returned to those
 * allowed to see it; participants are stored in their own table and only the ones the viewer
 * may see come back; the timeline is most-recent-day first.
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const author1: InteractionAuthor = { userId: U1, householdId: H, defaultVisibility: 'shared' };
const viewerU1: Viewer = { id: U1, householdId: H };
const viewerU2: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;
let ids: { next: () => string };

function deps() {
	return { interactions: createDrizzleInteractionRepository(db), ids, clock: systemClock };
}

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user)
		.values([
			{ id: U1, householdId: H, email: 'u1@x.test', name: 'One' },
			{ id: U2, householdId: H, email: 'u2@x.test', name: 'Two' }
		])
		.run();
	db.insert(schema.contact)
		.values([
			{ id: 'oma', householdId: H, createdBy: U1, visibility: 'shared', displayName: 'Oma' },
			{ id: 'opa', householdId: H, createdBy: U1, visibility: 'shared', displayName: 'Opa' },
			{ id: 'secret', householdId: H, createdBy: U1, visibility: 'private', displayName: 'Secret' }
		])
		.run();

	let n = 0;
	ids = { next: () => `i-${++n}` };
});

describe('interaction repository', () => {
	it('lists the timeline most recent day first, with participants by name', async () => {
		await logInteraction(deps(), author1, {
			contactId: 'oma',
			kind: 'call',
			happenedAt: '2026-08-01'
		});
		await logInteraction(deps(), author1, {
			contactId: 'oma',
			kind: 'met',
			happenedAt: '2026-08-30',
			title: 'Sunday lunch',
			participantIds: ['opa']
		});

		const list = await listInteractions(deps(), viewerU1, 'oma');
		expect(list.map((i) => i.happenedAt)).toEqual(['2026-08-30', '2026-08-01']);
		expect(list[0]).toMatchObject({
			kind: 'met',
			title: 'Sunday lunch',
			createdBy: U1,
			visibility: 'shared'
		});
		expect(list[0]!.participants).toEqual([
			{ contactId: 'opa', displayName: 'Opa', avatarPhotoId: null }
		]);
		expect(list[1]!.participants).toEqual([]);
	});

	it('pages backwards through the timeline without repeating or dropping a row', async () => {
		// Four days, logged out of order so the cursor cannot lean on insertion order.
		for (const day of ['2026-08-02', '2026-08-04', '2026-08-01', '2026-08-03']) {
			await logInteraction(deps(), author1, {
				contactId: 'oma',
				kind: 'call',
				happenedAt: day,
				title: day
			});
		}
		const repo = createDrizzleInteractionRepository(db);

		const first = await repo.listPageForContactVisibleTo(viewerU1, 'oma', { limit: 2 });
		expect(first.map((i) => i.happenedAt)).toEqual(['2026-08-04', '2026-08-03']);

		const last = first.at(-1)!;
		const second = await repo.listPageForContactVisibleTo(viewerU1, 'oma', {
			limit: 2,
			before: { happenedAt: last.happenedAt, createdAt: last.createdAt }
		});
		expect(second.map((i) => i.happenedAt)).toEqual(['2026-08-02', '2026-08-01']);

		const beyond = second.at(-1)!;
		expect(
			await repo.listPageForContactVisibleTo(viewerU1, 'oma', {
				limit: 2,
				before: { happenedAt: beyond.happenedAt, createdAt: beyond.createdAt }
			})
		).toEqual([]);
	});

	it('separates two interactions on the same day by when they were logged', async () => {
		// The cursor is (day, createdAt): without the second half, one of these would be lost.
		const clock = { now: () => 1_000 };
		await logInteraction({ ...deps(), clock }, author1, {
			contactId: 'oma',
			kind: 'call',
			happenedAt: '2026-08-01',
			title: 'morning'
		});
		await logInteraction({ ...deps(), clock: { now: () => 2_000 } }, author1, {
			contactId: 'oma',
			kind: 'met',
			happenedAt: '2026-08-01',
			title: 'afternoon'
		});
		const repo = createDrizzleInteractionRepository(db);

		const first = await repo.listPageForContactVisibleTo(viewerU1, 'oma', { limit: 1 });
		expect(first.map((i) => i.title)).toEqual(['afternoon']);

		const second = await repo.listPageForContactVisibleTo(viewerU1, 'oma', {
			limit: 1,
			before: { happenedAt: '2026-08-01', createdAt: first[0]!.createdAt }
		});
		expect(second.map((i) => i.title)).toEqual(['morning']);
	});

	it('keeps a page scoped to what the viewer may see', async () => {
		await logInteraction(deps(), author1, {
			contactId: 'oma',
			kind: 'call',
			happenedAt: '2026-08-02',
			title: 'private',
			visibility: 'private'
		});
		await logInteraction(deps(), author1, {
			contactId: 'oma',
			kind: 'call',
			happenedAt: '2026-08-01',
			title: 'shared'
		});
		const repo = createDrizzleInteractionRepository(db);

		// The author sees both; another member's first page skips the private one entirely
		// rather than returning a short page with a hole in it.
		expect(
			(await repo.listPageForContactVisibleTo(viewerU1, 'oma', { limit: 10 })).map((i) => i.title)
		).toEqual(['private', 'shared']);
		expect(
			(await repo.listPageForContactVisibleTo(viewerU2, 'oma', { limit: 10 })).map((i) => i.title)
		).toEqual(['shared']);
	});

	it('hides a private interaction from other members but shows it to its author', async () => {
		await logInteraction(deps(), author1, {
			contactId: 'oma',
			kind: 'call',
			happenedAt: '2026-08-01',
			title: 'shared call'
		});
		await logInteraction(deps(), author1, {
			contactId: 'oma',
			kind: 'letter',
			happenedAt: '2026-08-02',
			title: 'private letter',
			visibility: 'private'
		});

		const asAuthor = await listInteractions(deps(), viewerU1, 'oma');
		expect(asAuthor.map((i) => i.title)).toEqual(['private letter', 'shared call']);

		const asOther = await listInteractions(deps(), viewerU2, 'oma');
		expect(asOther.map((i) => i.title)).toEqual(['shared call']);
	});

	it('hides the whole timeline when the subject contact is private to someone else', async () => {
		await logInteraction(deps(), author1, {
			contactId: 'secret',
			kind: 'met',
			happenedAt: '2026-08-01'
		});

		expect(await listInteractions(deps(), viewerU2, 'secret')).toHaveLength(0);
		expect(await listInteractions(deps(), viewerU1, 'secret')).toHaveLength(1);
	});

	it('drops a participant the viewer may not see, but keeps the interaction', async () => {
		await logInteraction(deps(), author1, {
			contactId: 'oma',
			kind: 'met',
			happenedAt: '2026-08-01',
			participantIds: ['secret', 'opa']
		});

		const asOther = await listInteractions(deps(), viewerU2, 'oma');
		expect(asOther).toHaveLength(1);
		expect(asOther[0]!.participants.map((p) => p.contactId)).toEqual(['opa']);

		const asAuthor = await listInteractions(deps(), viewerU1, 'oma');
		expect(asAuthor[0]!.participants.map((p) => p.contactId).sort()).toEqual(['opa', 'secret']);
	});

	describe('the day they were last in touch', () => {
		it('is the latest day among the touchpoints the viewer may see, not the latest logged', async () => {
			await logInteraction(deps(), author1, {
				contactId: 'oma',
				kind: 'call',
				happenedAt: '2026-08-30'
			});
			await logInteraction(deps(), author1, {
				contactId: 'oma',
				kind: 'met',
				happenedAt: '2026-03-01'
			});
			await logInteraction(deps(), author1, {
				contactId: 'oma',
				kind: 'letter',
				happenedAt: '2026-01-05'
			});
			await logInteraction(deps(), author1, {
				contactId: 'opa',
				kind: 'met',
				happenedAt: '2026-12-24'
			});

			expect(await lastContactedOn(deps(), viewerU1, 'oma')).toBe('2026-08-30');
		});

		it('never reveals a private touchpoint through the profile header', async () => {
			await logInteraction(deps(), author1, {
				contactId: 'oma',
				kind: 'call',
				happenedAt: '2026-08-01'
			});
			await logInteraction(deps(), author1, {
				contactId: 'oma',
				kind: 'letter',
				happenedAt: '2026-08-02',
				visibility: 'private'
			});

			expect(await lastContactedOn(deps(), viewerU1, 'oma')).toBe('2026-08-02');
			expect(await lastContactedOn(deps(), viewerU2, 'oma')).toBe('2026-08-01');
		});

		it('is nothing for nobody touched, or for a person the viewer may not see', async () => {
			await logInteraction(deps(), author1, {
				contactId: 'secret',
				kind: 'met',
				happenedAt: '2026-08-01'
			});

			expect(await lastContactedOn(deps(), viewerU1, 'oma')).toBeNull();
			expect(await lastContactedOn(deps(), viewerU2, 'secret')).toBeNull();
			expect(await lastContactedOn(deps(), viewerU1, 'secret')).toBe('2026-08-01');
		});
	});
});

/*
 * The edit rule is checked again when the write lands, not only by the use-case's `findOwn`:
 * a touchpoint whose person turned private between the two, or a caller that skips the read,
 * still cannot be rewritten (docs/03 §3.7).
 */
describe('updateOwn (the author only, while they see it)', () => {
	const edit = {
		id: 'i-1',
		kind: 'call' as const,
		happenedAt: '2026-10-09',
		title: 'Phoned',
		description: null,
		participantIds: ['c-lea'],
		updatedAt: 99
	};
	let t: ReturnType<typeof removalDb>;
	let repo: ReturnType<typeof createDrizzleInteractionRepository>;

	function seed(id: string, over: Partial<typeof schema.interaction.$inferInsert> = {}) {
		t.db
			.insert(schema.interaction)
			.values({
				id,
				contactId: 'c-kurt',
				createdBy: AUTHOR,
				visibility: 'shared',
				kind: 'met',
				happenedAt: '2026-10-08',
				title: 'Coffee',
				...over
			})
			.run();
	}
	const titleOf = (id: string) =>
		t.db.select().from(schema.interaction).where(eq(schema.interaction.id, id)).get()?.title;
	const participantCount = () => t.db.select().from(schema.interactionParticipant).all().length;

	beforeEach(() => {
		t = removalDb();
		repo = createDrizzleInteractionRepository(t.db);
	});

	it("rewrites the author's own touchpoint and its participants", async () => {
		seed('i-1');
		expect(await repo.updateOwn({ id: AUTHOR, householdId: H }, edit)).toBe(true);
		expect(titleOf('i-1')).toBe('Phoned');
		expect(participantCount()).toBe(1);
	});

	const refused: [string, Partial<typeof schema.interaction.$inferInsert>, string][] = [
		["an admin on another member's shared touchpoint", {}, ADMIN],
		["a member on someone else's shared touchpoint", {}, MEMBER],
		['the author once the person is private to someone else', { contactId: 'c-secret' }, AUTHOR]
	];

	for (const [why, over, who] of refused) {
		it(`refuses ${why}, leaving the row and its participants alone`, async () => {
			seed('i-1', over);
			expect(await repo.updateOwn({ id: who, householdId: H }, edit)).toBe(false);
			expect(titleOf('i-1')).toBe('Coffee');
			expect(participantCount()).toBe(0);
			// The positive control: the same write on the editor's own touchpoint goes through.
			seed('i-own', { createdBy: who });
			expect(await repo.updateOwn({ id: who, householdId: H }, { ...edit, id: 'i-own' })).toBe(
				true
			);
		});
	}
});
