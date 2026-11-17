import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import { toFtsQuery } from '../domain/search/query';
import * as schema from './schema';
import { ensureSearchIndex } from './search-index';
import { createDrizzleSearchRepository } from './search-repository';

/*
 * Full search finds outing ideas by their title, note and link, done ones too and marked so
 * (docs/dev/02 §2.27.9), within the central visibility scoping (docs/dev/03 §3.7): a private one
 * only for its author, a surprise never for the member it is with.
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewerU1: Viewer = { id: U1, householdId: H };
const viewerU2: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleSearchRepository>;

const ids = async (viewer: Viewer, query: string) =>
	(await repo.searchPlans(viewer, toFtsQuery(query), 20)).map((h) => h.planId).sort();

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	ensureSearchIndex(sqlite);

	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user)
		.values([
			{ id: U1, householdId: H, email: 'u1@x.test', name: 'One' },
			{ id: U2, householdId: H, email: 'u2@x.test', name: 'Two' }
		])
		.run();
	db.insert(schema.contact)
		.values([
			{ id: 'c-hans', householdId: H, createdBy: U1, visibility: 'shared', displayName: 'Hans' },
			{ id: 'c-mia', householdId: H, createdBy: U1, visibility: 'shared', displayName: 'Mia' },
			{
				id: 'c-old',
				householdId: H,
				createdBy: U1,
				visibility: 'shared',
				displayName: 'Otto',
				archivedAt: 1
			}
		])
		.run();
	db.update(schema.user).set({ selfContactId: 'c-mia' }).where(eq(schema.user.id, U2)).run();
	db.insert(schema.activityIdea)
		.values([
			{
				id: 'p-open',
				contactId: 'c-hans',
				createdBy: U1,
				title: 'Zoo Zürich',
				note: 'Elefantenpark zuerst',
				url: 'https://zoo.ch/tickets',
				whenKind: 'on_date',
				whenOn: '2026-12-06'
			},
			{
				id: 'p-done',
				contactId: 'c-hans',
				createdBy: U1,
				title: 'Zoo Basel',
				doneAt: 1,
				doneOn: '2026-10-20',
				doneBy: U1
			},
			{
				id: 'p-private',
				contactId: 'c-hans',
				createdBy: U1,
				visibility: 'private',
				title: 'Zoo nachts'
			},
			{
				id: 'p-surprise',
				contactId: 'c-mia',
				createdBy: U1,
				hiddenFromPerson: 1,
				title: 'Zoo Mia'
			},
			{ id: 'p-archived', contactId: 'c-old', createdBy: U1, title: 'Zoo Otto' }
		])
		.run();

	repo = createDrizzleSearchRepository(db);
});

describe('searchPlans', () => {
	it('matches the title and returns the person it is with, the open ones first', async () => {
		const hits = await repo.searchPlans(viewerU1, toFtsQuery('zoo'), 20);
		expect(hits.map((h) => h.planId).slice(-1)).toEqual(['p-done']);
		expect(hits.find((h) => h.planId === 'p-open')).toEqual({
			planId: 'p-open',
			title: 'Zoo Zürich',
			done: false,
			doneOn: null,
			contactId: 'c-hans',
			contactName: 'Hans'
		});
	});

	it('matches the note and the link too', async () => {
		expect(await ids(viewerU1, 'elefantenpark')).toEqual(['p-open']);
		expect(await ids(viewerU1, 'tickets')).toEqual(['p-open']);
	});

	it('finds a done one, with the day it was done', async () => {
		const hits = await repo.searchPlans(viewerU1, toFtsQuery('basel'), 20);
		expect(hits).toMatchObject([{ planId: 'p-done', done: true, doneOn: '2026-10-20' }]);
	});

	it('never shows a private idea to another member, nor a surprise to the member it is with', async () => {
		expect(await ids(viewerU1, 'zoo')).toEqual(['p-done', 'p-open', 'p-private', 'p-surprise']);
		expect(await ids(viewerU2, 'zoo')).toEqual(['p-done', 'p-open']);
		expect(await ids(viewerU2, 'nachts')).toEqual([]);
		expect(await ids(viewerU2, 'mia')).toEqual([]);
	});

	it('leaves out an archived person, as the other browsing surfaces do', async () => {
		expect(await ids(viewerU1, 'otto')).toEqual([]);
	});

	it('follows an edit and a removal', async () => {
		db.update(schema.activityIdea)
			.set({ note: 'Seelöwen' })
			.where(eq(schema.activityIdea.id, 'p-open'))
			.run();
		expect(await ids(viewerU1, 'seelöwen')).toEqual(['p-open']);
		expect(await ids(viewerU1, 'elefantenpark')).toEqual([]);
		db.delete(schema.activityIdea).where(eq(schema.activityIdea.id, 'p-open')).run();
		expect(await ids(viewerU1, 'seelöwen')).toEqual([]);
	});
});
