import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { registerFirstAdmin, type AuthUser } from '../auth/accounts';
import { hashPassword, verifyPassword } from '../auth/password';
import type { Clock } from '../clock';
import { createDrizzleAccountRepository } from '../db/account-repository';
import * as schema from '../db/schema';
import type { AvatarDeps } from '../domain/media/avatars';
import { applyBookReview, prepareBookReview } from '../domain/nextcloud/review';
import { englishWording } from '../domain/import/monica/wording.fixture';
import { photoRepositoryWith } from '../domain/testing';
import { knownLabel } from '../i18n/import-wording';
import type { IdGenerator } from '../id';
import { createNextcloudServices, type NextcloudWiring } from './nextcloud';

/*
 * The nextcloud group of the composition root (docs/08 §8.3), over a real in-memory SQLite and
 * the demo's in-memory book: the link syncs as the household's Nextcloud actor, its new cards
 * reach the review the group hands the import page, and without a configured book the whole
 * group is null.
 */

const clock: Clock = { now: () => Date.UTC(2026, 9, 27, 9) };
let counter = 0;
const ids: IdGenerator = { next: () => `id-${++counter}` };

// The demo book's cards carry no picture: a call to either port fails loud.
const unexpected = (what: string) => async () => {
	throw new Error(`${what} was not expected in this test`);
};
const media = { put: unexpected('MediaStore.put'), read: unexpected('MediaStore.read') };
const avatarDeps: AvatarDeps = { photos: photoRepositoryWith({}), media, ids, clock };

let db: BunSQLiteDatabase<typeof schema>;
let wiring: NextcloudWiring;
let admin: AuthUser;

beforeEach(async () => {
	counter = 0;
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	admin = await registerFirstAdmin(
		{ accounts: createDrizzleAccountRepository(db), ids, hashPassword, verifyPassword },
		{
			householdName: 'Brunner',
			email: 'markus@example.test',
			name: 'Markus',
			password: 'correct horse battery',
			locale: 'en'
		}
	);
	db.insert(schema.contact)
		.values({
			id: 'c-thomas',
			householdId: admin.householdId,
			createdBy: admin.id,
			visibility: 'shared',
			firstName: 'Thomas',
			lastName: 'Widmer',
			displayName: 'Thomas Widmer'
		})
		.run();
	db.insert(schema.contactField)
		.values({ id: 'f1', contactId: 'c-thomas', kind: 'phone', value: '+41 79 330 87 41' })
		.run();
	wiring = {
		config: { nextcloud: { mode: 'demo', source: 'nextcloud:contacts' } },
		db,
		clock,
		ids,
		media: media as unknown as NextcloudWiring['media'],
		avatarDeps
	};
});

const request = { wording: { ...englishWording, knownLabel }, locale: 'en' as const };

describe('createNextcloudServices', () => {
	it('is null without a configured address book, so the link appears nowhere', () => {
		expect(createNextcloudServices({ ...wiring, config: { nextcloud: null } })).toBeNull();
	});

	it('syncs the book as the household’s Nextcloud actor, who is no member', async () => {
		const nextcloud = createNextcloudServices(wiring)!;

		expect(await nextcloud.link.sync(admin.householdId, request)).toMatchObject({
			ok: true,
			outcome: { newCards: 3 }
		});
		const actors = db.select().from(schema.user).where(eq(schema.user.kind, 'system')).all();
		expect(actors).toHaveLength(1);
		expect(actors[0]).toMatchObject({ householdId: admin.householdId, name: 'Nextcloud' });
		expect(await nextcloud.link.status(admin)).toMatchObject({ newCards: 3, conflicts: 0 });
	});

	it('hands the book’s new cards to the review, and the answers link them', async () => {
		const nextcloud = createNextcloudServices(wiring)!;
		await nextcloud.link.sync(admin.householdId, request);
		const { bookReviewDeps: deps, link } = nextcloud;

		const review = await prepareBookReview(deps, admin, link.source);
		const thomas = review.cards.find((c) => c.card.key === 'demo-thomas');
		expect(thomas?.candidates.map((c) => c.personId)).toEqual(['c-thomas']);

		const outcome = await applyBookReview(deps, {
			viewer: admin,
			source: link.source,
			answers: new Map([
				['demo-thomas', { kind: 'same', personId: 'c-thomas', takeCard: [] }],
				['demo-petra', { kind: 'new' }],
				['demo-markus', { kind: 'skip' }]
			]),
			wording: englishWording,
			locale: 'en'
		});
		expect(outcome).toMatchObject({ added: 1, completed: 1, skipped: 1 });
		expect(await link.status(admin)).toMatchObject({ newCards: 0 });
	});
});
