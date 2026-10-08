import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import {
	addMember,
	createCircle,
	setMembersRole,
	type CircleDeps,
	type MemberRoleDeps
} from '../domain/circles/circles';
import type { CircleMembershipReads } from '../domain/circles/memberships';
import { createDrizzleCircleMembershipReads } from './circle-membership-reads';
import { createDrizzleCircleRepository } from './circle-repository';
import * as schema from './schema';

/*
 * Integration spec for the Drizzle CircleRepository: creation, the one-circle reads, and the
 * membership writes — read back through the membership read model, whose own scoping is
 * specified in `circle-reads.test.ts`. Driven partly through the domain use-cases to exercise
 * the real wiring.
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewerU1: Viewer = { id: U1, householdId: H };
const viewerU2: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;
let deps: CircleDeps;
/** The read model, to see what the writes left behind. */
let memberships: CircleMembershipReads;
let roleDeps: MemberRoleDeps;
const NOW = 1_700_000_000_000;
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
		clock: { now: () => NOW }
	};
	memberships = createDrizzleCircleMembershipReads(db);
	roleDeps = { circles: deps.circles, memberships, clock: deps.clock };
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

		let members = await memberships.listMembersVisibleTo(viewerU1, id);
		expect(members.map((m) => m.contactId).sort()).toEqual(['jonas', 'mara']);
		expect(members.find((m) => m.contactId === 'mara')?.role).toBe('captain');

		await deps.circles.removeMembership(id, 'jonas');
		members = await memberships.listMembersVisibleTo(viewerU1, id);
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
		await setMembersRole(roleDeps, viewerU1, id, ['mara', 'jonas', 'outsider'], ' tenor ');

		const roles = Object.fromEntries(
			(await memberships.listMembersVisibleTo(viewerU1, id)).map((m) => [m.contactId, m.role])
		);
		expect(roles).toEqual({ mara: 'tenor', jonas: 'tenor', ida: 'bass' });
	});

	it('clears the role of the chosen members when the new role is blank', async () => {
		const id = await createCircle(deps, creatorU1, { name: 'Choir' });
		await addMember(deps, creatorU1, id, 'mara', 'alto');
		await setMembersRole(roleDeps, viewerU1, id, ['mara'], '');
		const [mara] = await memberships.listMembersVisibleTo(viewerU1, id);
		expect(mara.role).toBeNull();
	});

	it('does not touch a same-named member of another circle', async () => {
		const choir = await createCircle(deps, creatorU1, { name: 'Choir' });
		const club = await createCircle(deps, creatorU1, { name: 'Club' });
		await addMember(deps, creatorU1, choir, 'mara', 'alto');
		await addMember(deps, creatorU1, club, 'mara', 'captain');
		await setMembersRole(roleDeps, viewerU1, choir, ['mara'], 'tenor');
		const [inClub] = await memberships.listMembersVisibleTo(viewerU1, club);
		expect(inClub.role).toBe('captain');
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
			{
				id: 'm1',
				circleId: id,
				contactId: 'mara',
				role: 'coach',
				createdBy: U1,
				createdAt: NOW,
				updatedAt: NOW
			},
			{
				id: 'm2',
				circleId: id,
				contactId: 'jonas',
				role: 'coach',
				createdBy: U1,
				createdAt: NOW,
				updatedAt: NOW
			}
		]);

		const members = await memberships.listMembersVisibleTo(viewerU1, id);
		expect(members.map((m) => m.contactId).sort()).toEqual(['jonas', 'mara']);
		expect(members.every((m) => m.role === 'coach')).toBe(true);
	});

	it('skips a contact already in the circle without touching the role they joined with', async () => {
		const id = await createCircle(deps, creatorU1, { name: 'Team' });
		seedContact('mara');
		seedContact('jonas');
		await addMember(deps, creatorU1, id, 'mara', 'captain');

		await deps.circles.addMemberships([
			{
				id: 'm1',
				circleId: id,
				contactId: 'mara',
				role: 'coach',
				createdBy: U1,
				createdAt: NOW,
				updatedAt: NOW
			},
			{
				id: 'm2',
				circleId: id,
				contactId: 'jonas',
				role: 'coach',
				createdBy: U1,
				createdAt: NOW,
				updatedAt: NOW
			}
		]);

		// Only jonas is new — and jonas landing is the positive control for mara being skipped.
		const members = await memberships.listMembersVisibleTo(viewerU1, id);
		expect(members).toHaveLength(2);
		expect(members.find((m) => m.contactId === 'mara')?.role).toBe('captain');
		expect(members.find((m) => m.contactId === 'jonas')?.role).toBe('coach');
	});

	it('joins a contact named twice in the same batch only once', async () => {
		const id = await createCircle(deps, creatorU1, { name: 'Team' });
		seedContact('mara');

		// The skip runs per row inside the transaction, so it sees the row the batch just wrote.
		await deps.circles.addMemberships([
			{
				id: 'm1',
				circleId: id,
				contactId: 'mara',
				role: 'coach',
				createdBy: U1,
				createdAt: NOW,
				updatedAt: NOW
			},
			{
				id: 'm2',
				circleId: id,
				contactId: 'mara',
				role: 'coach',
				createdBy: U1,
				createdAt: NOW,
				updatedAt: NOW
			}
		]);

		expect(await memberships.listMembersVisibleTo(viewerU1, id)).toHaveLength(1);
	});

	it('writes nothing at all when one row in the batch fails', async () => {
		const id = await createCircle(deps, creatorU1, { name: 'Team' });
		seedContact('mara');

		// 'ghost' has no contact row, so the FK rejects it and the whole transaction rolls back.
		expect(
			deps.circles.addMemberships([
				{
					id: 'm1',
					circleId: id,
					contactId: 'mara',
					role: 'coach',
					createdBy: U1,
					createdAt: NOW,
					updatedAt: NOW
				},
				{
					id: 'm2',
					circleId: id,
					contactId: 'ghost',
					role: 'coach',
					createdBy: U1,
					createdAt: NOW,
					updatedAt: NOW
				}
			])
		).rejects.toThrow();

		expect(await memberships.listMembersVisibleTo(viewerU1, id)).toEqual([]);
	});
});

describe('renameRole', () => {
	function seedPhoto(id: string, circleId: string, circleRole: string | null) {
		db.insert(schema.photo)
			.values({
				id,
				householdId: H,
				circleId,
				circleRole,
				createdBy: U1,
				filePath: `${id}.jpg`,
				thumbPath: `${id}_t.jpg`,
				mime: 'image/jpeg'
			})
			.run();
	}
	const photoRole = (id: string) =>
		db
			.select({ role: schema.photo.circleRole })
			.from(schema.photo)
			.where(eq(schema.photo.id, id))
			.get()?.role;

	it('renames the chosen memberships and photos of this circle, and nothing of another', async () => {
		seedContact('mara');
		seedContact('jonas');
		const klasse = await createCircle(deps, creatorU1, { name: 'Class 1b' });
		const club = await createCircle(deps, creatorU1, { name: 'Club' });
		await addMember(deps, creatorU1, klasse, 'mara', 'Teacher');
		await addMember(deps, creatorU1, klasse, 'jonas', 'Pupil');
		await addMember(deps, creatorU1, club, 'mara', 'Teacher');
		seedPhoto('class-photo', klasse, 'Teacher');
		seedPhoto('club-photo', club, 'Teacher');

		// The ids name the club's photo and member too: the circle bounds the write, not the ids.
		await deps.circles.renameRole({
			circleId: klasse,
			contactIds: ['mara'],
			photoIds: ['class-photo', 'club-photo'],
			role: 'Class teacher',
			updatedAt: NOW + 1
		});

		const roles = async (circleId: string) =>
			Object.fromEntries(
				(await memberships.listMembersVisibleTo(viewerU1, circleId)).map((m) => [
					m.contactId,
					m.role
				])
			);
		expect(await roles(klasse)).toEqual({ mara: 'Class teacher', jonas: 'Pupil' });
		expect(photoRole('class-photo')).toBe('Class teacher');
		expect(await roles(club)).toEqual({ mara: 'Teacher' });
		expect(photoRole('club-photo')).toBe('Teacher');
	});
});
