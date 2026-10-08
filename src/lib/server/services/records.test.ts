import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { registerFirstAdmin, type AuthUser } from '../auth/accounts';
import { hashPassword, verifyPassword } from '../auth/password';
import type { Clock } from '../clock';
import { createDrizzleAccountRepository } from '../db/account-repository';
import { createDrizzleContactRepository } from '../db/contact-repository';
import * as schema from '../db/schema';
import { addContactField, listContactFields } from '../domain/contact-fields/contact-fields';
import { createContact } from '../domain/contacts/contacts';
import { addImportantDate, listImportantDates } from '../domain/dates/important-dates';
import { assignTagByName, listTagsForContact } from '../domain/tags/tags';
import type { IdGenerator } from '../id';
import { createServices } from './app-services';
import type { AuthConfig } from './auth';
import { createRecordServices, type RecordWiring } from './records';

/*
 * The records group of the composition root (docs/08 §8.3), built over a real in-memory SQLite:
 * what the edge gets from `locals.services.records` must work end to end — a field, a date and
 * a tag added through the group show on the person they were added to.
 */

const clock: Clock = { now: () => Date.UTC(2026, 9, 8, 9) };
let counter = 0;
const ids: IdGenerator = { next: () => `id-${++counter}` };

let sqlite: Database;
let db: BunSQLiteDatabase<typeof schema>;
let wiring: RecordWiring;
let admin: AuthUser;

beforeEach(async () => {
	counter = 0;
	sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	admin = await registerFirstAdmin(
		{ accounts: createDrizzleAccountRepository(db), ids, hashPassword, verifyPassword },
		{
			householdName: 'Pollari',
			email: 'andy@example.test',
			name: 'Andy',
			password: 'correct horse battery',
			locale: 'en'
		}
	);
	wiring = { db, clock, ids };
});

const viewerOf = (user: AuthUser) => ({ id: user.id, householdId: user.householdId });

async function addPerson(firstName: string) {
	return createContact(
		{ contacts: createDrizzleContactRepository(db), ids, clock },
		{
			userId: admin.id,
			householdId: admin.householdId,
			defaultVisibility: 'shared',
			locale: 'en'
		},
		{ firstName, lastName: 'Pollari' }
	);
}

describe('createRecordServices', () => {
	it('hands each record use-case the one repository the edge reads', () => {
		const records = createRecordServices(wiring);
		expect(records.contactFieldDeps.fields).toBe(records.contactFields);
		expect(records.importantDateDeps.dates).toBe(records.importantDates);
		expect(records.tagDeps.tags).toBe(records.tags);
	});

	it('wires the injected clock and ids', () => {
		const records = createRecordServices(wiring);
		for (const deps of [records.contactFieldDeps, records.importantDateDeps, records.tagDeps]) {
			expect(deps.clock).toBe(clock);
			expect(deps.ids).toBe(ids);
		}
	});

	it('shows a field, a date and a tag added through the group on their person', async () => {
		const records = createRecordServices(wiring);
		const anna = await addPerson('Anna');

		const fieldId = await addContactField(records.contactFieldDeps, {
			contactId: anna,
			kind: 'email',
			value: 'anna@example.test'
		});
		const dateId = await addImportantDate(records.importantDateDeps, {
			contactId: anna,
			kind: 'anniversary',
			date: '2010-06-12'
		});
		const tagId = await assignTagByName(records.tagDeps, admin.householdId, anna, 'Climbing');

		const fields = await listContactFields(records.contactFieldDeps, viewerOf(admin), anna);
		expect(fields.map((field) => field.id)).toEqual([fieldId]);
		const dates = await listImportantDates(records.importantDateDeps, viewerOf(admin), anna);
		expect(dates.map((date) => date.id)).toEqual([dateId]);
		const tags = await listTagsForContact(records.tagDeps, viewerOf(admin), anna);
		expect(tags.map((tag) => tag.id)).toEqual([tagId]);
	});
});

describe('createServices', () => {
	it('groups the records context under `records`', () => {
		const config: AuthConfig = {
			url: 'https://stella.example.test',
			auth: { local: true, oidc: false },
			oidc: {
				issuer: '',
				clientId: '',
				clientSecret: '',
				redirectUri: '',
				scopes: 'openid',
				providerName: 'authelia',
				allowedGroups: [],
				adminGroups: [],
				allowedEmails: [],
				jitProvision: false,
				linkByEmail: false,
				syncRoles: false,
				syncProfile: false,
				rpLogout: false
			}
		};
		const services = createServices({
			// Nothing here touches a file: the media store is lazy on disk.
			config: { ...config, mediaDir: '/nonexistent/stella-media' },
			db,
			sqlite,
			clock,
			ids
		});
		expect(services.records.tagDeps.tags).toBe(services.records.tags);
		expect(services.records.contactFieldDeps.clock).toBe(clock);
	});
});
