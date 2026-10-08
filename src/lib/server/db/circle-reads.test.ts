import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import { addMember, createCircle, type CircleDeps } from '../domain/circles/circles';
import type { CircleDirectoryReads } from '../domain/circles/directory';
import type { CircleMembershipReads } from '../domain/circles/memberships';
import { createDrizzleCircleDirectoryReads } from './circle-directory-reads';
import { createDrizzleCircleMembershipReads } from './circle-membership-reads';
import { createDrizzleCircleRepository } from './circle-repository';
import * as schema from './schema';

/*
 * Integration spec for the circles' read models: the overview with its member counts and
 * faces, and the memberships the circle page and a person's page list. A membership is visible
 * only when its circle AND its contact are (docs/03 §3.7). Written through the repository's
 * use-cases, so the rows are the ones the app writes.
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewerU1: Viewer = { id: U1, householdId: H };
const viewerU2: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;
let deps: CircleDeps;
let directory: CircleDirectoryReads;
let memberships: CircleMembershipReads;
let seq = 0;

function seedContact(id: string, visibility: 'shared' | 'private' = 'shared', createdBy = U1) {
	db.insert(schema.contact)
		.values({ id, householdId: H, createdBy, visibility, displayName: id })
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
	seq = 0;
	deps = {
		circles: createDrizzleCircleRepository(db),
		ids: { next: () => `id-${seq++}` },
		clock: { now: () => 1_700_000_000_000 }
	};
	directory = createDrizzleCircleDirectoryReads(db);
	memberships = createDrizzleCircleMembershipReads(db);
});

const creatorU1 = { userId: U1, householdId: H, defaultVisibility: 'shared' as const };

describe('listVisibleTo member counts', () => {
	it('counts only members the viewer can see', async () => {
		seedContact('shared-c', 'shared');
		seedContact('secret-c', 'private', U1); // U2 can't see this contact
		const id = await createCircle(deps, creatorU1, { name: 'Club' });
		await addMember(deps, creatorU1, id, 'shared-c');
		await addMember(deps, creatorU1, id, 'secret-c');

		const forU1 = await directory.listVisibleTo(viewerU1);
		expect(forU1.find((c) => c.id === id)?.memberCount).toBe(2);

		const forU2 = await directory.listVisibleTo(viewerU2);
		// the circle still lists, but only the visible member counts
		expect(forU2.find((c) => c.id === id)?.memberCount).toBe(1);
	});

	it('carries a few visible faces as a preview, never a hidden one, and stops at the cap', async () => {
		for (const name of ['ann', 'bea', 'cem', 'dee', 'eve']) seedContact(name, 'shared');
		seedContact('secret-c', 'private', U1);
		const id = await createCircle(deps, creatorU1, { name: 'Choir' });
		for (const name of ['eve', 'dee', 'cem', 'bea', 'ann', 'secret-c'])
			await addMember(deps, creatorU1, id, name);

		const forU2 = (await directory.listVisibleTo(viewerU2)).find((c) => c.id === id)!;
		// Alphabetical, capped, and the private contact is not among them for U2 …
		expect(forU2.preview.map((m) => m.contactId)).toEqual(['ann', 'bea', 'cem', 'dee']);
		expect(forU2.memberCount).toBe(5);

		// … while its owner does see it, still within the cap.
		const forU1 = (await directory.listVisibleTo(viewerU1)).find((c) => c.id === id)!;
		expect(forU1.preview).toHaveLength(4);
		expect(forU1.memberCount).toBe(6);
	});

	it('lists a circle with no members as count 0', async () => {
		const id = await createCircle(deps, creatorU1, { name: 'Empty' });
		const list = await directory.listVisibleTo(viewerU1);
		expect(list.find((c) => c.id === id)?.memberCount).toBe(0);
		expect(list.find((c) => c.id === id)?.preview).toEqual([]);
	});
});

describe('membership lists', () => {
	beforeEach(() => {
		seedContact('mara');
		seedContact('jonas');
	});

	it('lists a circle’s members by name, never a contact the viewer cannot see', async () => {
		seedContact('secret-c', 'private', U1);
		const id = await createCircle(deps, creatorU1, { name: 'Club' });
		await addMember(deps, creatorU1, id, 'mara', 'captain');
		await addMember(deps, creatorU1, id, 'jonas');
		await addMember(deps, creatorU1, id, 'secret-c');

		expect((await memberships.listMembersVisibleTo(viewerU2, id)).map((m) => m.contactId)).toEqual([
			'jonas',
			'mara'
		]);
		expect(await memberships.listMembersVisibleTo(viewerU1, id)).toHaveLength(3);
	});

	it('lists a contact’s circles', async () => {
		const a = await createCircle(deps, creatorU1, { name: 'Ski Course' });
		const b = await createCircle(deps, creatorU1, { name: 'Day School' });
		await addMember(deps, creatorU1, a, 'mara');
		await addMember(deps, creatorU1, b, 'mara');
		const circles = await memberships.listForContactVisibleTo(viewerU1, 'mara');
		expect(circles.map((c) => c.name).sort()).toEqual(['Day School', 'Ski Course']);
	});

	it('hides a membership whose circle the viewer cannot see', async () => {
		const id = await createCircle(
			deps,
			{ ...creatorU1, defaultVisibility: 'private' },
			{ name: 'Secret Club' }
		);
		await addMember(deps, creatorU1, id, 'mara');
		expect(await memberships.listForContactVisibleTo(viewerU2, 'mara')).toHaveLength(0);
		expect(await memberships.listForContactVisibleTo(viewerU1, 'mara')).toHaveLength(1);
	});
});

describe('role uses', () => {
	beforeEach(() => {
		seedContact('mara');
		seedContact('jonas');
	});

	it('reports each visible membership’s role with its circle name', async () => {
		const id = await createCircle(deps, creatorU1, { name: 'Club' });
		await addMember(deps, creatorU1, id, 'mara', 'captain');
		await addMember(deps, creatorU1, id, 'jonas');

		const uses = await memberships.listRoleUsesVisibleTo(viewerU1);
		expect(uses).toEqual([
			{ circleName: 'Club', role: null },
			{ circleName: 'Club', role: 'captain' }
		]);
	});

	it('leaves out roles from a circle the viewer cannot see', async () => {
		const id = await createCircle(
			deps,
			{ ...creatorU1, defaultVisibility: 'private' },
			{ name: 'Secret Club' }
		);
		await addMember(deps, creatorU1, id, 'mara', 'captain');
		expect(await memberships.listRoleUsesVisibleTo(viewerU2)).toEqual([]);
		expect(await memberships.listRoleUsesVisibleTo(viewerU1)).toEqual([
			{ circleName: 'Secret Club', role: 'captain' }
		]);
	});
});
