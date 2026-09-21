import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import { addMember, createCircle, setMembersRole, type CircleDeps } from '../domain/circles/circles';
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

	it('carries a few visible faces as a preview, never a hidden one, and stops at the cap', async () => {
		for (const name of ['ann', 'bea', 'cem', 'dee', 'eve']) seedContact(name, 'shared');
		seedContact('secret-c', 'private', U1);
		const id = await createCircle(deps, creatorU1, { name: 'Choir' });
		for (const name of ['eve', 'dee', 'cem', 'bea', 'ann', 'secret-c']) await addMember(deps, creatorU1, id, name);

		const forU2 = (await deps.circles.listVisibleTo(viewerU2)).find((c) => c.id === id)!;
		// Alphabetical, capped, and the private contact is not among them for U2 …
		expect(forU2.preview.map((m) => m.contactId)).toEqual(['ann', 'bea', 'cem', 'dee']);
		expect(forU2.memberCount).toBe(5);

		// … while its owner does see it, still within the cap.
		const forU1 = (await deps.circles.listVisibleTo(viewerU1)).find((c) => c.id === id)!;
		expect(forU1.preview).toHaveLength(4);
		expect(forU1.memberCount).toBe(6);
	});

	it('lists a circle with no members as count 0', async () => {
		const id = await createCircle(deps, creatorU1, { name: 'Empty' });
		const list = await deps.circles.listVisibleTo(viewerU1);
		expect(list.find((c) => c.id === id)?.memberCount).toBe(0);
		expect(list.find((c) => c.id === id)?.preview).toEqual([]);
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

	it('re-roles the chosen members in one go and leaves everyone else alone', async () => {
		seedContact('ida');
		seedContact('outsider');
		const id = await createCircle(deps, creatorU1, { name: 'Choir' });
		await addMember(deps, creatorU1, id, 'mara', 'alto');
		await addMember(deps, creatorU1, id, 'jonas', 'alto');
		await addMember(deps, creatorU1, id, 'ida', 'bass');

		// `outsider` is not in the circle: naming them must not make them join.
		await setMembersRole(deps, id, ['mara', 'jonas', 'outsider'], ' tenor ');

		const roles = Object.fromEntries(
			(await deps.circles.listMembersVisibleTo(viewerU1, id)).map((m) => [m.contactId, m.role])
		);
		expect(roles).toEqual({ mara: 'tenor', jonas: 'tenor', ida: 'bass' });
	});

	it('clears the role of the chosen members when the new role is blank', async () => {
		const id = await createCircle(deps, creatorU1, { name: 'Choir' });
		await addMember(deps, creatorU1, id, 'mara', 'alto');
		await setMembersRole(deps, id, ['mara'], '');
		const [mara] = await deps.circles.listMembersVisibleTo(viewerU1, id);
		expect(mara.role).toBeNull();
	});

	it('does not touch a same-named member of another circle', async () => {
		const choir = await createCircle(deps, creatorU1, { name: 'Choir' });
		const club = await createCircle(deps, creatorU1, { name: 'Club' });
		await addMember(deps, creatorU1, choir, 'mara', 'alto');
		await addMember(deps, creatorU1, club, 'mara', 'captain');
		await setMembersRole(deps, choir, ['mara'], 'tenor');
		const [inClub] = await deps.circles.listMembersVisibleTo(viewerU1, club);
		expect(inClub.role).toBe('captain');
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

describe('role uses', () => {
	beforeEach(() => {
		seedContact('mara');
		seedContact('jonas');
	});

	it('reports each visible membership’s role with its circle name', async () => {
		const id = await createCircle(deps, creatorU1, { name: 'Club' });
		await addMember(deps, creatorU1, id, 'mara', 'captain');
		await addMember(deps, creatorU1, id, 'jonas');

		const uses = await deps.circles.listRoleUsesVisibleTo(viewerU1);
		expect(uses).toEqual([
			{ circleName: 'Club', role: null },
			{ circleName: 'Club', role: 'captain' }
		]);
	});

	it('leaves out roles from a circle the viewer cannot see', async () => {
		const id = await createCircle(deps, { ...creatorU1, defaultVisibility: 'private' }, { name: 'Secret Club' });
		await addMember(deps, creatorU1, id, 'mara', 'captain');
		expect(await deps.circles.listRoleUsesVisibleTo(viewerU2)).toEqual([]);
		expect(await deps.circles.listRoleUsesVisibleTo(viewerU1)).toEqual([
			{ circleName: 'Secret Club', role: 'captain' }
		]);
	});
});

/*
 * `addMemberships` is the atomic seam behind the multi-pick (docs/02 §2.4.2): one transaction
 * decides who is already a member and inserts the rest, so a pick either lands whole or not at
 * all. The skip has to happen inside that transaction — deciding it outside would let a
 * concurrent join slip in between the check and the insert.
 */
describe('addMemberships', () => {
	it('inserts every new member in one go', async () => {
		const id = await createCircle(deps, creatorU1, { name: 'Team' });
		seedContact('mara');
		seedContact('jonas');

		await deps.circles.addMemberships([
			{ id: 'm1', circleId: id, contactId: 'mara', role: 'coach', createdBy: U1, createdAt: NOW, updatedAt: NOW },
			{ id: 'm2', circleId: id, contactId: 'jonas', role: 'coach', createdBy: U1, createdAt: NOW, updatedAt: NOW }
		]);

		const members = await deps.circles.listMembersVisibleTo(viewerU1, id);
		expect(members.map((m) => m.contactId).sort()).toEqual(['jonas', 'mara']);
		expect(members.every((m) => m.role === 'coach')).toBe(true);
	});

	it('skips a contact already in the circle without touching the role they joined with', async () => {
		const id = await createCircle(deps, creatorU1, { name: 'Team' });
		seedContact('mara');
		seedContact('jonas');
		await addMember(deps, creatorU1, id, 'mara', 'captain');

		await deps.circles.addMemberships([
			{ id: 'm1', circleId: id, contactId: 'mara', role: 'coach', createdBy: U1, createdAt: NOW, updatedAt: NOW },
			{ id: 'm2', circleId: id, contactId: 'jonas', role: 'coach', createdBy: U1, createdAt: NOW, updatedAt: NOW }
		]);

		// Only jonas is new — and jonas landing is the positive control for mara being skipped.
		const members = await deps.circles.listMembersVisibleTo(viewerU1, id);
		expect(members).toHaveLength(2);
		expect(members.find((m) => m.contactId === 'mara')?.role).toBe('captain');
		expect(members.find((m) => m.contactId === 'jonas')?.role).toBe('coach');
	});

	it('joins a contact named twice in the same batch only once', async () => {
		const id = await createCircle(deps, creatorU1, { name: 'Team' });
		seedContact('mara');

		// The skip runs per row inside the transaction, so it sees the row the batch just wrote.
		await deps.circles.addMemberships([
			{ id: 'm1', circleId: id, contactId: 'mara', role: 'coach', createdBy: U1, createdAt: NOW, updatedAt: NOW },
			{ id: 'm2', circleId: id, contactId: 'mara', role: 'coach', createdBy: U1, createdAt: NOW, updatedAt: NOW }
		]);

		expect(await deps.circles.listMembersVisibleTo(viewerU1, id)).toHaveLength(1);
	});

	it('writes nothing at all when one row in the batch fails', async () => {
		const id = await createCircle(deps, creatorU1, { name: 'Team' });
		seedContact('mara');

		// 'ghost' has no contact row, so the FK rejects it and the whole transaction rolls back.
		expect(
			deps.circles.addMemberships([
				{ id: 'm1', circleId: id, contactId: 'mara', role: 'coach', createdBy: U1, createdAt: NOW, updatedAt: NOW },
				{ id: 'm2', circleId: id, contactId: 'ghost', role: 'coach', createdBy: U1, createdAt: NOW, updatedAt: NOW }
			])
		).rejects.toThrow();

		expect(await deps.circles.listMembersVisibleTo(viewerU1, id)).toEqual([]);
	});
});
