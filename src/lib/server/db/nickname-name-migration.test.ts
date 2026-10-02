import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nameWithNickname } from '../../people/display-name';
import { ensureSearchIndex } from './search-index';

/*
 * The nickname joins the shown name it shapes (docs/02 §2.2, docs/03 §contact): *Thomas „Tom“
 * Brunner*. Names stored before that are updated once, where the old rule made them (first and
 * last name) and a nickname is set; a name somebody chose (*Opa Kurt*) is left alone. The quote
 * marks are those of the language the member who added the person picked, else of any member
 * of the household who picked one, else English — the migration has no member acting.
 *
 * Driven the way `db/index.ts` runs it — Drizzle's migrator over a database that already holds
 * people and, as a running installation does, the search index with its triggers — and held
 * against the pure rule (`nameWithNickname`), so the SQL and the TypeScript cannot drift apart.
 */

const MIGRATIONS = './drizzle';
const TAG = '0020_nickname_in_shown_name';
const H = 'household-1';

interface Journal {
	entries: { tag: string }[];
}

function migrationsBefore(tag: string): string {
	const folder = mkdtempSync(join(tmpdir(), 'stella-migrations-'));
	cpSync(MIGRATIONS, folder, { recursive: true });
	const journalPath = join(folder, 'meta', '_journal.json');
	const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as Journal;
	journal.entries = journal.entries.slice(0, journal.entries.findIndex((entry) => entry.tag === tag));
	writeFileSync(journalPath, JSON.stringify(journal));
	return folder;
}

interface Row {
	id: string;
	first: string | null;
	last: string | null;
	nick: string | null;
	shown: string;
	by: 'de-member' | 'unset-member';
}

const ROWS: Row[] = [
	{ id: 'tom', first: 'Thomas', last: 'Brunner', nick: 'Tom', shown: 'Thomas Brunner', by: 'de-member' },
	{ id: 'leo', first: 'Leonardo', last: 'Pollari', nick: 'Leo', shown: 'Leonardo Pollari', by: 'unset-member' },
	{ id: 'kurt', first: 'Kurt', last: 'Lehmann', nick: 'Kurti', shown: 'Opa Kurt', by: 'de-member' },
	{ id: 'same', first: 'Anna', last: 'Keller', nick: 'anna', shown: 'Anna Keller', by: 'de-member' },
	{ id: 'plain', first: 'Lea', last: 'Brunner', nick: null, shown: 'Lea Brunner', by: 'de-member' },
	{ id: 'nofirst', first: null, last: 'Huber', nick: 'Sepp', shown: 'Huber', by: 'de-member' },
	{ id: 'nickonly', first: null, last: null, nick: 'Hansi', shown: 'Hansi', by: 'de-member' }
];

function householdBefore(memberLocale: 'de' | null): Database {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	migrate(drizzle(sqlite), { migrationsFolder: migrationsBefore(TAG) });
	// A running installation has its search index and triggers before this migration runs.
	ensureSearchIndex(sqlite);
	sqlite.query('INSERT INTO household (id, name) VALUES (?, ?)').run(H, 'Home');
	const member = sqlite.query('INSERT INTO user (id, household_id, email, name, locale_pref) VALUES (?, ?, ?, ?, ?)');
	member.run('de-member', H, 'de@x.test', 'De', memberLocale);
	member.run('unset-member', H, 'unset@x.test', 'Unset', null);
	const person = sqlite.query(
		`INSERT INTO contact (id, household_id, created_by, visibility, display_name, first_name, last_name, nickname)
		 VALUES (?, ?, ?, 'shared', ?, ?, ?, ?)`
	);
	for (const r of ROWS) person.run(r.id, H, r.by, r.shown, r.first, r.last, r.nick);
	return sqlite;
}

const shownOf = (db: Database, id: string) =>
	(db.query('SELECT display_name AS shown FROM contact WHERE id = ?').get(id) as { shown: string }).shown;

describe(`migration ${TAG}`, () => {
	it('writes the nickname into names the old rule made, by the pure rule, and leaves the rest', () => {
		const db = householdBefore('de');

		migrate(drizzle(db), { migrationsFolder: MIGRATIONS });

		for (const r of ROWS) {
			const expected =
				nameWithNickname({ displayName: r.shown, firstName: r.first, lastName: r.last, nickname: r.nick }, 'de') ?? r.shown;
			expect([r.id, shownOf(db, r.id)]).toEqual([r.id, expected]);
		}
		// The two the household will notice, said outright.
		expect(shownOf(db, 'tom')).toBe('Thomas „Tom“ Brunner');
		expect(shownOf(db, 'kurt')).toBe('Opa Kurt');
		db.close();
	});

	it('takes the quote marks of the household when the adder picked no language, else English', () => {
		const withGerman = householdBefore('de');
		const withNone = householdBefore(null);

		migrate(drizzle(withGerman), { migrationsFolder: MIGRATIONS });
		migrate(drizzle(withNone), { migrationsFolder: MIGRATIONS });

		expect(shownOf(withGerman, 'leo')).toBe('Leonardo „Leo“ Pollari');
		expect(shownOf(withNone, 'leo')).toBe('Leonardo “Leo” Pollari');
		withGerman.close();
		withNone.close();
	});

	it('keeps the search index in step with the names it changes', () => {
		const db = householdBefore('de');

		migrate(drizzle(db), { migrationsFolder: MIGRATIONS });

		const indexed = db.query("SELECT content FROM contact_fts WHERE contact_id = 'tom'").get() as { content: string };
		expect(indexed.content).toContain('Thomas „Tom“ Brunner');
		db.close();
	});
});
