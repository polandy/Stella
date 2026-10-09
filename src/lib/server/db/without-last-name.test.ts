import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import { setLastNames } from '../domain/contacts/last-names';
import { editNameParts } from '../domain/contacts/name-parts';
import { mergeContacts } from '../domain/contacts/remove-contact';
import { askAgainForLastName, settleWithoutLastName } from '../domain/contacts/without-last-name';
import * as schema from './schema';
import { createDrizzleContactRepository } from './contact-repository';
import { createDrizzleSurnameFacts } from './surname-facts';

/*
 * Integration spec for *no last name* (docs/02 §2.2.4.2) on the real schema: the mark is
 * written on the person, read back by the list, taken back by *Ask again*, and ended by any
 * write that gives a last name — the list's batch as much as the profile's name editor.
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewer: Viewer = { id: U1, householdId: H };
const NOW = 1_700_000_000_000;

let db: BunSQLiteDatabase<typeof schema>;
let deps: ReturnType<typeof depsOf>;

function depsOf(database: BunSQLiteDatabase<typeof schema>) {
	const repo = createDrizzleContactRepository(database);
	return {
		withoutLastName: repo,
		names: repo,
		contacts: repo,
		clock: { now: () => NOW },
		ids: { next: () => crypto.randomUUID() }
	};
}

const markOf = (id: string) =>
	db
		.select({ at: schema.contact.withoutLastNameAt })
		.from(schema.contact)
		.where(eq(schema.contact.id, id))
		.get()?.at;

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
			{ id: 'jonas', householdId: H, createdBy: U1, displayName: 'Jonas', firstName: 'Jonas' },
			{ id: 'tom', householdId: H, createdBy: U1, displayName: 'Tom', firstName: 'Tom' },
			{
				id: 'secret',
				householdId: H,
				createdBy: U2,
				visibility: 'private',
				displayName: 'Secret'
			}
		])
		.run();
	deps = depsOf(db);
});

describe('settling a person as having no last name', () => {
	it('stores the moment on the person, and the list reads it back', async () => {
		expect(await settleWithoutLastName(deps, viewer, 'jonas')).toBe(true);

		expect(markOf('jonas')).toBe(NOW);
		const { people } = await createDrizzleSurnameFacts(db).loadSurnameFactsVisibleTo(viewer);
		expect(people.find((p) => p.id === 'jonas')?.withoutLastNameAt).toBe(NOW);
		// The control: someone nobody settled reads as unmarked.
		expect(people.find((p) => p.id === 'tom')?.withoutLastNameAt).toBeNull();
	});

	it('takes the mark back with Ask again', async () => {
		await settleWithoutLastName(deps, viewer, 'jonas');

		expect(await askAgainForLastName(deps, viewer, 'jonas')).toBe(true);

		expect(markOf('jonas')).toBeNull();
	});

	it('writes nothing on another member’s private person', async () => {
		expect(await settleWithoutLastName(deps, viewer, 'secret')).toBe(false);

		expect(markOf('secret')).toBeNull();
	});
});

describe('a last name ends no last name', () => {
	it('is cleared by a batch from the list', async () => {
		await settleWithoutLastName(deps, viewer, 'jonas');

		await setLastNames(
			deps,
			viewer,
			[{ contactId: 'jonas', lastName: 'Brunner', replace: false }],
			'en'
		);

		expect(markOf('jonas')).toBeNull();
	});

	it('is cleared by the profile’s name editor giving a last name', async () => {
		await settleWithoutLastName(deps, viewer, 'jonas');
		const edit = {
			firstName: 'Jonas',
			nickname: null,
			displayName: '',
			formerName: null,
			keepFormerName: false
		};

		await editNameParts(deps, viewer, 'jonas', { ...edit, lastName: null }, 'en');
		expect(markOf('jonas')).toBe(NOW);

		await editNameParts(deps, viewer, 'jonas', { ...edit, lastName: 'Brunner' }, 'en');
		expect(markOf('jonas')).toBeNull();
	});
});

describe('merging a settled person', () => {
	it('keeps the mark on the survivor while neither brings a last name', async () => {
		await settleWithoutLastName(deps, viewer, 'jonas');

		expect(await mergeContacts(deps, viewer, 'tom', 'jonas')).toBe(true);

		expect(markOf('tom')).toBe(NOW);
	});

	it('ends the mark when the record merged away brings a last name', async () => {
		await settleWithoutLastName(deps, viewer, 'tom');
		await setLastNames(
			deps,
			viewer,
			[{ contactId: 'jonas', lastName: 'Brunner', replace: false }],
			'en'
		);

		await mergeContacts(deps, viewer, 'tom', 'jonas');

		expect(markOf('tom')).toBeNull();
	});
});
