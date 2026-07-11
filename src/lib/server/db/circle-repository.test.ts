import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import { addMember, createCircle, type CircleDeps } from '../domain/circles/circles';
import { createDrizzleCircleRepository } from './circle-repository';
import * as schema from './schema';

/*
 * Integration spec for the Drizzle CircleRepository: creation, visibility-scoped listing with
 * member counts, and memberships (a membership is visible only when its circle AND contact are,
 * §3.7). Driven partly through the domain use-cases to exercise the real wiring.
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewerU1: Viewer = { id: U1, householdId: H };
const viewerU2: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;
let deps: CircleDeps;
const NOW = 1_700_000_000_000;
let seq = 0;

function seedContact(id: string, visibility: 'shared' | 'private' = 'shared', createdBy = U1) {
	db.insert(schema.contact).values({ id, householdId: H, createdBy, visibility, displayName: id }).run();
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
	seq = 0;
	deps = {
		circles: createDrizzleCircleRepository(db),
		ids: { next: () => `id-${seq++}` },
		clock: { now: () => NOW }
	};
});

const creatorU1 = { userId: U1, householdId: H, defaultVisibility: 'shared' as const };

describe('createCircle + findByNameVisibleTo', () => {
	it('creates and finds a circle case-insensitively', async () => {
		await createCircle(deps, creatorU1, { name: 'Kegelclub Bühl', kind: 'club', color: 'mauve' });
		const found = await deps.circles.findByNameVisibleTo(viewerU1, 'kegelclub bühl');
		expect(found).toMatchObject({ name: 'Kegelclub Bühl', kind: 'club', color: 'mauve' });
	});

	it('does not find a private circle owned by someone else', async () => {
		await createCircle(deps, { ...creatorU1, defaultVisibility: 'private' }, { name: 'Secret' });
		expect(await deps.circles.findByNameVisibleTo(viewerU2, 'Secret')).toBeNull();
		expect(await deps.circles.findByNameVisibleTo(viewerU1, 'Secret')).not.toBeNull();
	});
});

describe('listVisibleTo member counts', () => {
	it('counts only members the viewer can see', async () => {
		seedContact('shared-c', 'shared');
		seedContact('secret-c', 'private', U1); // U2 can't see this contact
		const id = await createCircle(deps, creatorU1, { name: 'Club' });
		await addMember(deps, creatorU1, id, 'shared-c');
		await addMember(deps, creatorU1, id, 'secret-c');

		const forU1 = await deps.circles.listVisibleTo(viewerU1);
		expect(forU1.find((c) => c.id === id)?.memberCount).toBe(2);

		const forU2 = await deps.circles.listVisibleTo(viewerU2);
		// the circle still lists, but only the visible member counts
		expect(forU2.find((c) => c.id === id)?.memberCount).toBe(1);
	});

	it('lists a circle with no members as count 0', async () => {
		const id = await createCircle(deps, creatorU1, { name: 'Empty' });
		const list = await deps.circles.listVisibleTo(viewerU1);
		expect(list.find((c) => c.id === id)?.memberCount).toBe(0);
	});
});

describe('memberships', () => {
	beforeEach(() => {
		seedContact('mara');
		seedContact('jonas');
	});

	it('adds idempotently, lists members, and removes', async () => {
		const id = await createCircle(deps, creatorU1, { name: 'Club' });
		await addMember(deps, creatorU1, id, 'mara', 'captain');
		await addMember(deps, creatorU1, id, 'mara'); // idempotent
		await addMember(deps, creatorU1, id, 'jonas');

		let members = await deps.circles.listMembersVisibleTo(viewerU1, id);
		expect(members.map((m) => m.contactId).sort()).toEqual(['jonas', 'mara']);
		expect(members.find((m) => m.contactId === 'mara')?.role).toBe('captain');

		await deps.circles.removeMembership(id, 'jonas');
		members = await deps.circles.listMembersVisibleTo(viewerU1, id);
		expect(members.map((m) => m.contactId)).toEqual(['mara']);
	});

	it('lists a contact’s circles', async () => {
		const a = await createCircle(deps, creatorU1, { name: 'Ski Course' });
		const b = await createCircle(deps, creatorU1, { name: 'Day School' });
		await addMember(deps, creatorU1, a, 'mara');
		await addMember(deps, creatorU1, b, 'mara');
		const circles = await deps.circles.listForContactVisibleTo(viewerU1, 'mara');
		expect(circles.map((c) => c.name).sort()).toEqual(['Day School', 'Ski Course']);
	});

	it('hides a membership whose circle the viewer cannot see', async () => {
		const id = await createCircle(deps, { ...creatorU1, defaultVisibility: 'private' }, { name: 'Secret Club' });
		await addMember(deps, creatorU1, id, 'mara');
		expect(await deps.circles.listForContactVisibleTo(viewerU2, 'mara')).toHaveLength(0);
		expect(await deps.circles.listForContactVisibleTo(viewerU1, 'mara')).toHaveLength(1);
	});
});
