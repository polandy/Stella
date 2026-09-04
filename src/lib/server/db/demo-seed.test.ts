import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { eq } from 'drizzle-orm';
import { seedDemoData } from './demo-seed';
import * as schema from './schema';
import { seedRelationshipTypes } from './seed';

/*
 * Spec for the Brunner demo seed: it must produce a self-consistent dataset (foreign keys
 * satisfied), create a known break-glass admin on a fresh database, attach to an existing
 * household when present, and be safe to run repeatedly (idempotent — the test phase reseeds
 * on every boot).
 */

let db: BunSQLiteDatabase<typeof schema>;

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	seedRelationshipTypes(db);
});

describe('seedDemoData', () => {
	it('creates a demo household with a break-glass admin on an empty database', () => {
		const result = seedDemoData(db);

		expect(result.created).toBe(true);
		const households = db.select().from(schema.household).all();
		expect(households).toHaveLength(1);
		expect(households[0].name).toBe('Familie Brunner');

		const admins = db.select().from(schema.user).all();
		expect(admins).toHaveLength(1);
		expect(admins[0].role).toBe('admin');
		expect(admins[0].passwordHash).toBeTruthy();
		// The break-glass admin must be login-capable with a real Argon2id hash.
		expect(Bun.password.verifySync('stella-demo-1234', admins[0].passwordHash as string)).toBe(true);
	});

	it('populates contacts, relationships, circles and memberships', () => {
		seedDemoData(db);

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
		seedDemoData(db); // the contact has to exist before a date can point at it
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
		seedDemoData(db);

		const dates = db.select().from(schema.importantDate).all();
		expect(dates.some((d) => d.id === 'demo-date-bday-markus')).toBe(false);
		// Positive control: the seeding it does do still happened.
		expect(dates.some((d) => d.kind === 'anniversary')).toBe(true);
	});

	it('is idempotent — reseeding does not duplicate rows', () => {
		seedDemoData(db);
		const firstContacts = db.select().from(schema.contact).all().length;
		const firstRels = db.select().from(schema.relationship).all().length;

		const second = seedDemoData(db);

		expect(second.created).toBe(false);
		expect(db.select().from(schema.contact).all()).toHaveLength(firstContacts);
		expect(db.select().from(schema.relationship).all()).toHaveLength(firstRels);
		expect(db.select().from(schema.household).all()).toHaveLength(1);
	});

	it('attaches to an existing household and its admin instead of creating a demo one', () => {
		db.insert(schema.household).values({ id: 'real-hh', name: 'Real' }).run();
		db.insert(schema.user)
			.values({ id: 'real-admin', householdId: 'real-hh', email: 'a@x.test', name: 'A', role: 'admin' })
			.run();

		const result = seedDemoData(db);

		expect(result.created).toBe(false);
		expect(result.householdId).toBe('real-hh');
		expect(db.select().from(schema.household).all()).toHaveLength(1);
		// Demo contacts belong to the real household and are authored by its admin.
		const contacts = db.select().from(schema.contact).where(eq(schema.contact.householdId, 'real-hh')).all();
		expect(contacts).toHaveLength(25);
		expect(contacts.every((c) => c.createdBy === 'real-admin')).toBe(true);
	});
});
