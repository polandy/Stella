import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import type { NewContact } from '../domain/contacts/contacts';
import * as schema from './schema';
import { createDrizzleContactDirectoryReads } from './contact-directory-reads';
import { createDrizzleContactNameReads } from './contact-name-reads';
import { createDrizzleContactRepository } from './contact-repository';
import { createDrizzleNameCandidateReads } from './name-candidate-reads';

/*
 * Integration spec for the read models of the people — the directory, the names a page
 * resolves and quick-add's name candidates: each scoped through the central query-scoping
 * (docs/03 §3.7, docs/08 §8.3). The contact repository only seeds them.
 */

const H1 = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewerU1: Viewer = { id: U1, householdId: H1 };
const viewerU2: Viewer = { id: U2, householdId: H1 };

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleContactRepository>;
let directory: ReturnType<typeof createDrizzleContactDirectoryReads>;
let nameReads: ReturnType<typeof createDrizzleContactNameReads>;
let candidateReads: ReturnType<typeof createDrizzleNameCandidateReads>;

const NOW = 1_700_000_000_000;
function contactInput(over: Partial<NewContact>): NewContact {
	return {
		id: 'c-x',
		householdId: H1,
		createdBy: U1,
		visibility: 'shared',
		displayName: 'X',
		firstName: null,
		lastName: null,
		nickname: null,
		description: null,
		birthDate: null,
		birthDatePrecision: 'full',
		gender: null,
		howWeMet: null,
		metDate: null,
		metPlace: null,
		createdAt: NOW,
		updatedAt: NOW,
		...over
	};
}

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values({ id: H1, name: 'H' }).run();
	db.insert(schema.user)
		.values([
			{ id: U1, householdId: H1, email: 'u1@x.test', name: 'One' },
			{ id: U2, householdId: H1, email: 'u2@x.test', name: 'Two' }
		])
		.run();
	repo = createDrizzleContactRepository(db);
	directory = createDrizzleContactDirectoryReads(db);
	nameReads = createDrizzleContactNameReads(db);
	candidateReads = createDrizzleNameCandidateReads(db);
});

describe('createDrizzleContactDirectoryReads', () => {
	it('lists only visible contacts, ordered by display name', async () => {
		await repo.insert(contactInput({ id: 'c-shared', visibility: 'shared', displayName: 'Bea' }));
		await repo.insert(
			contactInput({ id: 'c-priv', visibility: 'private', createdBy: U1, displayName: 'Ada' })
		);

		const listForU2 = await directory.listVisibleTo(viewerU2);
		expect(listForU2.map((c) => c.id)).toEqual(['c-shared']);

		const listForU1 = await directory.listVisibleTo(viewerU1);
		expect(listForU1.map((c) => c.displayName)).toEqual(['Ada', 'Bea']); // sorted
	});

	it('carries the nickname in the list summary, which is what the directory finds people by', async () => {
		await repo.insert(contactInput({ id: 'c-nick', displayName: 'Leonie', nickname: 'Leni' }));

		expect((await directory.listVisibleTo(viewerU1)).find((c) => c.id === 'c-nick')?.nickname).toBe(
			'Leni'
		);
	});

	it('carries the birth date in the list summary, which is what a family link is dated from', async () => {
		// The relationship form offers the younger one's birthday as the since day (docs/02
		// §2.4), and it reads it off this list rather than fetching each person in it.
		await repo.insert(contactInput({ id: 'c-born', displayName: 'Lena', birthDate: '2015-05-20' }));

		expect(
			(await directory.listVisibleTo(viewerU1)).find((c) => c.id === 'c-born')?.birthDate
		).toBe('2015-05-20');
	});

	it('carries where and when they were met in the list summary, which tells namesakes apart', async () => {
		// Two people called just "Thomas": the pickers say which is which from these (docs/02 §2.2.3).
		await repo.insert(
			contactInput({
				id: 'c-met',
				displayName: 'Thomas',
				metPlace: 'Blüemlisalphütte',
				metDate: '2026-08-12'
			})
		);

		expect((await directory.listVisibleTo(viewerU1)).find((c) => c.id === 'c-met')).toMatchObject({
			metPlace: 'Blüemlisalphütte',
			metDate: '2026-08-12'
		});
	});

	describe('archived people', () => {
		beforeEach(async () => {
			await repo.insert(contactInput({ id: 'c-old', displayName: 'Old Neighbour' }));
			await repo.insert(contactInput({ id: 'c-here', displayName: 'Still Here' }));
		});

		it('lists the archived ones, which no other list shows', async () => {
			await repo.setArchived('c-old', 1_700_000_000_000);

			const archived = (await directory.listArchivedVisibleTo(viewerU1)).map((c) => c.id);
			expect(archived).toEqual(['c-old']);
			// positive control: it is the same visibility scope, so a private contact of another
			// member stays out of it even once archived.
			await repo.insert(
				contactInput({
					id: 'c-theirs',
					visibility: 'private',
					createdBy: U2,
					displayName: 'Theirs'
				})
			);
			await repo.setArchived('c-theirs', 1_700_000_000_000);
			expect((await directory.listArchivedVisibleTo(viewerU1)).map((c) => c.id)).toEqual(['c-old']);
			expect((await directory.listArchivedVisibleTo(viewerU2)).map((c) => c.id).sort()).toEqual([
				'c-old',
				'c-theirs'
			]);
		});

		it('takes an archived contact out of the directory and the name suggestions', async () => {
			await repo.setArchived('c-old', 1_700_000_000_000);

			const listed = (await directory.listVisibleTo(viewerU1)).map((c) => c.id);
			expect(listed).not.toContain('c-old');
			// positive control: everyone still in the household is listed.
			expect(listed).toContain('c-here');

			const candidates = (await candidateReads.listNameCandidatesVisibleTo(viewerU1)).map(
				(c) => c.id
			);
			expect(candidates).not.toContain('c-old');
			expect(candidates).toContain('c-here');
		});
	});
});

describe('listNameCandidatesVisibleTo (docs/02 §2.2.1)', () => {
	const linked = (id: string, from: string, to: string) =>
		db
			.insert(schema.relationship)
			.values({
				id,
				householdId: H1,
				fromContactId: from,
				toContactId: to,
				typeId: 't-friend',
				createdBy: U1
			})
			.run();

	beforeEach(async () => {
		db.insert(schema.relationshipType)
			.values({
				id: 't-friend',
				householdId: H1,
				key: 'friend',
				forwardLabel: 'Friend',
				reverseLabel: 'Friend',
				category: 'social',
				symmetric: 1
			})
			.run();
		await repo.insert(
			contactInput({ id: 'c-hans', displayName: 'Hans Roth', firstName: 'Hans', lastName: 'Roth' })
		);
		await repo.insert(
			contactInput({ id: 'c-lena', displayName: 'Lena Roth', firstName: 'Lena', lastName: 'Roth' })
		);
		await repo.insert(
			contactInput({
				id: 'c-secret',
				displayName: 'Secret Roth',
				lastName: 'Roth',
				visibility: 'private',
				createdBy: U2
			})
		);
		linked('r-1', 'c-hans', 'c-lena');
		linked('r-2', 'c-hans', 'c-secret');
	});

	it('lists only the people the viewer may see, with how many visible relationships each has', async () => {
		const forU1 = await candidateReads.listNameCandidatesVisibleTo(viewerU1);
		expect(forU1.map((c) => [c.id, c.relationshipCount])).toEqual([
			['c-hans', 1], // the link to U2's private person does not count for U1
			['c-lena', 1]
		]);
		// Positive control: the owner of the private person sees them, and the link counts.
		const forU2 = await candidateReads.listNameCandidatesVisibleTo(viewerU2);
		expect(forU2.map((c) => [c.id, c.relationshipCount])).toEqual([
			['c-hans', 2],
			['c-lena', 1],
			['c-secret', 1]
		]);
	});
});

describe('reading a few people by id', () => {
	beforeEach(async () => {
		await repo.insert(contactInput({ id: 'c-anna', displayName: 'Anna' }));
		await repo.insert(
			contactInput({
				id: 'c-ben',
				displayName: 'Ben',
				lastName: 'Brunner',
				description: 'from school'
			})
		);
		await repo.insert(contactInput({ id: 'c-old', displayName: 'Old Neighbour' }));
		await repo.insert(
			contactInput({ id: 'c-theirs', visibility: 'private', createdBy: U2, displayName: 'Theirs' })
		);
		await repo.setArchived('c-old', NOW);
	});

	const sorted = (names: { id: string; displayName: string }[]) =>
		[...names].sort((a, b) => a.id.localeCompare(b.id));

	it('names exactly the asked-for people the viewer may see, archived ones included', async () => {
		const names = await nameReads.listNamesAmongVisibleTo(viewerU1, [
			'c-anna',
			'c-old',
			'c-theirs',
			'c-gone'
		]);
		expect(sorted(names)).toEqual([
			{ id: 'c-anna', displayName: 'Anna' },
			{ id: 'c-old', displayName: 'Old Neighbour' }
		]);
		// It is the visibility scope: the private person's owner is named them too.
		const asked = await nameReads.listNamesAmongVisibleTo(viewerU2, ['c-old', 'c-theirs']);
		expect(sorted(asked)).toEqual([
			{ id: 'c-old', displayName: 'Old Neighbour' },
			{ id: 'c-theirs', displayName: 'Theirs' }
		]);
	});

	it('names only the people the household still browses, when asked for those', async () => {
		const names = await nameReads.listBrowsableNamesAmong(viewerU1, [
			'c-anna',
			'c-ben',
			'c-old',
			'c-theirs'
		]);
		expect(sorted(names)).toEqual([
			{ id: 'c-anna', displayName: 'Anna' },
			{ id: 'c-ben', displayName: 'Ben' }
		]);
		// The same scope as the directory it stands in for.
		const listed = (await directory.listVisibleTo(viewerU2)).map((c) => ({
			id: c.id,
			displayName: c.displayName
		}));
		expect(
			sorted(
				await nameReads.listBrowsableNamesAmong(viewerU2, ['c-anna', 'c-ben', 'c-old', 'c-theirs'])
			)
		).toEqual(sorted(listed));
	});

	it('reads at most as many browsable ids as asked for, from the browsing scope', async () => {
		// U1 browses Anna and Ben only: Old Neighbour is archived, Theirs is U2's private record.
		expect((await directory.listSomeBrowsableIdsVisibleTo(viewerU1, 5)).sort()).toEqual([
			'c-anna',
			'c-ben'
		]);
		expect(await directory.listSomeBrowsableIdsVisibleTo(viewerU1, 1)).toHaveLength(1);
		// The same scope as the directory it stands in for.
		const listed = (await directory.listVisibleTo(viewerU2)).map((c) => c.id).sort();
		expect((await directory.listSomeBrowsableIdsVisibleTo(viewerU2, 5)).sort()).toEqual(listed);
	});

	it('counts the archived people the viewer may see', async () => {
		expect(await directory.countArchivedVisibleTo(viewerU1)).toBe(1);
		await repo.setArchived('c-theirs', NOW);
		expect(await directory.countArchivedVisibleTo(viewerU1)).toBe(1);
		expect(await directory.countArchivedVisibleTo(viewerU2)).toBe(2);
		expect(await directory.countArchivedVisibleTo(viewerU2)).toBe(
			(await directory.listArchivedVisibleTo(viewerU2)).length
		);
	});

	it('reads what tells the browsable people apart, and nothing else', async () => {
		const rows = await directory.listDistinguishableVisibleTo(viewerU1);
		expect(rows.map((r) => r.id).sort()).toEqual(['c-anna', 'c-ben']);
		expect(rows.find((r) => r.id === 'c-ben')).toEqual({
			id: 'c-ben',
			displayName: 'Ben',
			lastName: 'Brunner',
			description: 'from school',
			metPlace: null,
			metDate: null
		});
	});
});
