import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { asc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { datedAt, isTakenAt, type Dated } from '../../media/taken-at';
import { photoDatedAt } from './photo-dated-at';

/*
 * Parity of the two statements of when a photo is dated (docs/03 §photo): `datedAt` orders a
 * page in TS, `photoDatedAt` orders a read in SQL, and nothing but this test keeps them alike.
 * A table of just the two columns, so the rule is all that is exercised.
 */

const dated = sqliteTable('dated', {
	id: integer('id').primaryKey(),
	takenAt: text('taken_at'),
	createdAt: integer('created_at').notNull()
});

const ADDED = Date.UTC(2026, 9, 9, 12, 0, 0);

/** Every shape `isTakenAt` lets through, and the photo without one. */
const PHOTOS: Dated[] = [
	{ takenAt: '2024-06-01T18:30:05', createdAt: ADDED },
	{ takenAt: '2024-06-01T18:30:05Z', createdAt: ADDED },
	{ takenAt: '2024-06-01T18:30:05+02:00', createdAt: ADDED },
	{ takenAt: '2024-06-01T18:30:05-05:30', createdAt: ADDED },
	{ takenAt: '2024-12-31T23:59:59+14:00', createdAt: ADDED },
	{ takenAt: '2024-02-29T00:00:00', createdAt: ADDED },
	{ takenAt: '1970-01-01T00:00:00Z', createdAt: ADDED },
	{ takenAt: '1899-07-14T09:00:00', createdAt: ADDED },
	{ takenAt: null, createdAt: ADDED }
];

function inSql(photos: readonly Dated[]): number[] {
	const sqlite = new Database(':memory:');
	sqlite.exec(
		'create table dated (id integer primary key, taken_at text, created_at integer not null)'
	);
	const db = drizzle(sqlite);
	db.insert(dated)
		.values(photos.map((photo, id) => ({ id, ...photo })))
		.run();
	return db
		.select({ at: photoDatedAt(dated) })
		.from(dated)
		.orderBy(asc(dated.id))
		.all()
		.map((row) => row.at);
}

describe('photoDatedAt', () => {
	it('is fed only capture dates the stored shape allows', () => {
		for (const { takenAt } of PHOTOS) if (takenAt !== null) expect(isTakenAt(takenAt)).toBe(true);
	});

	it('names the same moment as datedAt for every shape of capture date', () => {
		expect(inSql(PHOTOS)).toEqual(PHOTOS.map(datedAt));
	});
});
