import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { eq } from 'drizzle-orm';
import { DEMO_ADMIN_PASSWORD, seedDemoData } from './demo-seed';
import * as schema from './schema';
import { seedRelationshipTypes } from './seed';

/*
 * Spec for the Brunner demo seed: it must produce a self-consistent dataset (foreign keys
 * satisfied), create a known break-glass admin on a fresh database, attach to an existing
 * household when present, and be safe to run repeatedly (idempotent — the test phase reseeds
 * on every boot).
 *
 * Hashing is injected. Argon2id costs real CPU by design, and paying for it in every case
 * that only looks at contacts or circles made this file the slowest in the suite — slow
 * enough that under a full parallel run it tripped the 5 s per-test budget. `seed` passes a
 * stub; the one case below that cares about the algorithm asks for the real adapter.
 */

/** A hash nobody has to compute: recognisable, and tied to the password it was made from. */
const stubHash = (password: string) => `stub-hash:${password}`;

let db: BunSQLiteDatabase<typeof schema>;

/** Seeds without paying for Argon2id. */
const seed = (database: BunSQLiteDatabase<typeof schema>) =>
	seedDemoData(database, { hashPassword: stubHash });

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	seedRelationshipTypes(db);
});

describe('seedDemoData', () => {
	it('creates a demo household with a break-glass admin on an empty database', () => {
		const result = seed(db);

		expect(result.created).toBe(true);
		const households = db.select().from(schema.household).all();
		expect(households).toHaveLength(1);
		expect(households[0].name).toBe('Familie Brunner');

		const users = db.select().from(schema.user).all();
		const admin = users.find((u) => u.role === 'admin');
		expect(admin).toBeDefined();
		// The break-glass admin is login-capable: the seed hashed the demo password itself
		// and stored what came back.
		expect(admin!.passwordHash).toBe(stubHash(DEMO_ADMIN_PASSWORD));
	});

	it('hashes the break-glass password with the real Argon2id adapter when nothing is injected', () => {
		// The only case that pays for a real hash: it is what makes the demo login work at all.
		seedDemoData(db);

		const admin = db.select().from(schema.user).all().find((u) => u.role === 'admin');
		const hash = admin!.passwordHash as string;
		expect(hash.startsWith('$argon2id$')).toBe(true);
		expect(hash).not.toBe(DEMO_ADMIN_PASSWORD);
	});

	it('gives the demo household a second member, so the story shows more than one author', () => {
		seed(db);

		const members = db.select().from(schema.user).all();
		expect(members.map((m) => m.role).sort()).toEqual(['admin', 'member']);

		const second = members.find((m) => m.role === 'member')!;
		const written = db
			.select()
			.from(schema.journalEntry)
			.where(eq(schema.journalEntry.createdBy, second.id))
			.all();
		const touched = db
			.select()
			.from(schema.interaction)
			.where(eq(schema.interaction.createdBy, second.id))
			.all();
		expect(written.length + touched.length).toBeGreaterThan(0);

		// positive control: the admin still wrote most of it, so both names appear on the story
		const byAdmin = db
			.select()
			.from(schema.journalEntry)
			.where(eq(schema.journalEntry.createdBy, members.find((m) => m.role === 'admin')!.id))
			.all();
		expect(byAdmin.length).toBeGreaterThan(written.length);
	});

	it('populates contacts, relationships, circles and memberships', () => {
		seed(db);

		expect(db.select().from(schema.contact).all()).toHaveLength(25);
		// Every relationship references a real, existing type and two existing contacts (FK on).
		const rels = db.select().from(schema.relationship).all();
		expect(rels.length).toBeGreaterThan(40);
		// 2–3 clubs + school with classes are represented.
		const circles = db.select().from(schema.circle).all();
		expect(circles.length).toBe(11);
		const classes = circles.filter((c) => c.kind === 'class');
		expect(classes).toHaveLength(2);
		// Nested school › class: each class points at its parent school circle.
		for (const klass of classes) {
			expect(klass.parentCircleId).toBe('demo-circle-schule');
		}
		expect(db.select().from(schema.circleMembership).all().length).toBeGreaterThan(30);
		// Birthdays come from `contact.birth_date`, never from an important_date row
		// (docs/02 §2.13.2) — only anniversaries and named dates are seeded.
		const dates = db.select().from(schema.importantDate).all();
		expect(dates.length).toBeGreaterThan(0);
		expect(dates.some((d) => d.kind === 'birthday')).toBe(false);
		expect(db.select().from(schema.contact).all().every((c) => c.birthDate !== null)).toBe(true);
	});

	it('clears the birthday rows an earlier seed version wrote', () => {
		// Those rows shadowed the derived birthday and, with remind off, silenced every one.
		seed(db); // the contact has to exist before a date can point at it
		db.insert(schema.importantDate)
			.values({
				id: 'demo-date-bday-markus',
				contactId: 'demo-c-markus',
				kind: 'birthday',
				label: 'Geburtstag',
				date: '1983-03-14',
				recursYearly: 1,
				remind: 0
			})
			.run();
		seed(db);

		const dates = db.select().from(schema.importantDate).all();
		expect(dates.some((d) => d.id === 'demo-date-bday-markus')).toBe(false);
		// Positive control: the seeding it does do still happened.
		expect(dates.some((d) => d.kind === 'anniversary')).toBe(true);
	});

	it('is idempotent — reseeding does not duplicate rows', () => {
		seed(db);
		const firstContacts = db.select().from(schema.contact).all().length;
		const firstRels = db.select().from(schema.relationship).all().length;

		const second = seed(db);

		expect(second.created).toBe(false);
		expect(db.select().from(schema.contact).all()).toHaveLength(firstContacts);
		expect(db.select().from(schema.relationship).all()).toHaveLength(firstRels);
		expect(db.select().from(schema.household).all()).toHaveLength(1);
	});

	it('has people naming each other, so the demo shows a passive reference at all', () => {
		seed(db);

		const notes = db.select().from(schema.noteMention).all();
		const entries = db.select().from(schema.journalMention).all();

		// Both surfaces of the "Mentioned in" list need something to show (docs/02 §2.20.1).
		expect(notes.length).toBeGreaterThan(0);
		expect(entries.length).toBeGreaterThan(0);

		// A stored mention is id-based, and points at somebody other than the entry's subject.
		const bodies = db.select().from(schema.note).all().map((n) => n.body);
		expect(bodies.some((b) => b.includes('@{contact:demo-c-'))).toBe(true);
		expect(bodies.some((b) => b.includes('@{person:'))).toBe(false);
		const subjects = new Map(db.select().from(schema.note).all().map((n) => [n.id, n.contactId]));
		expect(notes.every((m) => subjects.get(m.noteId) !== m.contactId)).toBe(true);
	});

	it('attaches to an existing household and its admin instead of creating a demo one', () => {
		db.insert(schema.household).values({ id: 'real-hh', name: 'Real' }).run();
		db.insert(schema.user)
			.values({ id: 'real-admin', householdId: 'real-hh', email: 'a@x.test', name: 'A', role: 'admin' })
			.run();

		const result = seed(db);

		expect(result.created).toBe(false);
		expect(result.householdId).toBe('real-hh');
		expect(db.select().from(schema.household).all()).toHaveLength(1);
		// Demo contacts belong to the real household and are authored by its admin.
		const contacts = db.select().from(schema.contact).where(eq(schema.contact.householdId, 'real-hh')).all();
		expect(contacts).toHaveLength(25);
		expect(contacts.every((c) => c.createdBy === 'real-admin')).toBe(true);
	});
});
