import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { buildDashboard } from '../domain/dashboard/dashboard';
import type { Viewer } from '../access/visibility';
import { createDrizzleDashboardRepository } from './dashboard-repository';
import * as schema from './schema';

/*
 * Integration spec for the Drizzle DashboardRepository + buildDashboard: newest-first ordering
 * and visibility scoping (private records of others never reach a member's dashboard, §3.7).
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewerU2: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleDashboardRepository>;

function seedContact(id: string, at: number, visibility: 'shared' | 'private' = 'shared', createdBy = U1) {
	db.insert(schema.contact)
		.values({ id, householdId: H, createdBy, visibility, displayName: id, createdAt: at })
		.run();
}
function seedNote(id: string, contactId: string, at: number, visibility: 'shared' | 'private' = 'shared', createdBy = U1) {
	db.insert(schema.note)
		.values({ id, contactId, createdBy, visibility, body: `body ${id}`, createdAt: at })
		.run();
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
	repo = createDrizzleDashboardRepository(db);
});

describe('recentContacts', () => {
	it('returns visible contacts newest-first', async () => {
		seedContact('old', 100);
		seedContact('new', 300);
		seedContact('mid', 200);
		const rows = await repo.recentContacts(viewerU2, 10);
		expect(rows.map((r) => r.id)).toEqual(['new', 'mid', 'old']);
	});

	it('excludes another member’s private contact', async () => {
		seedContact('shared', 100, 'shared', U1);
		seedContact('secret', 200, 'private', U1);
		const rows = await repo.recentContacts(viewerU2, 10);
		expect(rows.map((r) => r.id)).toEqual(['shared']);
	});
});

describe('recentNotes', () => {
	beforeEach(() => seedContact('mara', 100));

	it('joins the contact name and excludes private notes of others', async () => {
		seedNote('n-shared', 'mara', 100, 'shared', U1);
		seedNote('n-secret', 'mara', 200, 'private', U1);
		const rows = await repo.recentNotes(viewerU2, 10);
		expect(rows.map((r) => r.id)).toEqual(['n-shared']);
		expect(rows[0].contactName).toBe('mara');
	});
});

describe('buildDashboard (integration)', () => {
	it('composes the signed-in member’s dashboard from scoped data', async () => {
		seedContact('mara', 100, 'shared', U2);
		seedContact('secret', 200, 'private', U1); // U2 can't see this
		seedNote('n1', 'mara', 150, 'shared', U2);

		const d = await buildDashboard({ dashboard: repo }, viewerU2);
		expect(d.newPeople.map((p) => p.id)).toEqual(['mara']);
		expect(d.newPeople[0].addedByYou).toBe(true);
		// contributions: U2 added mara (contact) and n1 (note), newest first
		expect(d.contributions.map((c) => c.id)).toEqual(['n1', 'mara']);
	});
});
