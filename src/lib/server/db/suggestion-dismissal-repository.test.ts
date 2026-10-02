import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import type { NewDismissal } from '../domain/relationships/suggestion-review';
import * as schema from './schema';
import {
	createDrizzleSuggestionDismissalRepository,
	createDrizzleSurnameDismissalRepository
} from './suggestion-dismissal-repository';

/*
 * Integration spec for the Drizzle SuggestionDismissalRepository: one row per claim however
 * often it is declined, and a log that never crosses a household (docs/concepts/relationship-
 * suggestions.md §6.4).
 */

const H = 'household-1';
const OTHER_H = 'household-2';
const U1 = 'user-1';
const viewer: Viewer = { id: U1, householdId: H };
const otherViewer: Viewer = { id: 'user-2', householdId: OTHER_H };

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleSuggestionDismissalRepository>;

const dismissal = (over: Partial<NewDismissal> = {}): NewDismissal => ({
	id: 'd-1',
	householdId: H,
	relation: 'parent',
	pairKey: 'steve wingkam',
	dismissedBy: U1,
	dismissedAt: 1_000,
	...over
});

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household)
		.values([
			{ id: H, name: 'H' },
			{ id: OTHER_H, name: 'Other' }
		])
		.run();
	db.insert(schema.user)
		.values([
			{ id: U1, householdId: H, email: 'u1@x.test', name: 'One' },
			{ id: 'user-2', householdId: OTHER_H, email: 'u2@x.test', name: 'Two' }
		])
		.run();
	repo = createDrizzleSuggestionDismissalRepository(db);
});

describe('the dismissal log', () => {
	it('reads back what the household declined', async () => {
		await repo.dismiss(dismissal());
		expect(await repo.listForHousehold(viewer)).toEqual([
			{ relation: 'parent', pairKey: 'steve wingkam', dismissedAt: 1_000, dismissedBy: U1 }
		]);
	});

	it('keeps one row per claim when the same no is given twice', async () => {
		await repo.dismiss(dismissal());
		await repo.dismiss(dismissal({ id: 'd-2', dismissedAt: 2_000 }));
		expect(await repo.listForHousehold(viewer)).toEqual([
			{ relation: 'parent', pairKey: 'steve wingkam', dismissedAt: 1_000, dismissedBy: U1 }
		]);
	});

	it('tells two relations over one pair apart', async () => {
		await repo.dismiss(dismissal());
		await repo.dismiss(dismissal({ id: 'd-2', relation: 'sibling', dismissedAt: 2_000 }));
		expect((await repo.listForHousehold(viewer)).map((d) => d.relation).sort()).toEqual([
			'parent',
			'sibling'
		]);
	});

	it('takes a no back, and reports when there was none to take back', async () => {
		await repo.dismiss(dismissal());
		expect(await repo.restore(viewer, 'parent', 'steve wingkam')).toBe(true);
		expect(await repo.listForHousehold(viewer)).toEqual([]);
		expect(await repo.restore(viewer, 'parent', 'steve wingkam')).toBe(false);
	});

	/*
	 * Asserted against the other household's own log rather than an empty read, so a repository
	 * that simply wrote nothing could not pass either half of this.
	 */
	it('keeps one household’s answers out of another’s', async () => {
		await repo.dismiss(dismissal());
		await repo.dismiss(dismissal({ id: 'd-2', householdId: OTHER_H, dismissedBy: 'user-2' }));

		expect(await repo.restore(otherViewer, 'parent', 'steve wingkam')).toBe(true);
		expect(await repo.listForHousehold(otherViewer)).toEqual([]);
		expect(await repo.listForHousehold(viewer)).toHaveLength(1);
	});
});

/*
 * The household's *not this name* (docs/concepts/surnames.md §5) lives in the same log, under
 * the relation `last_name`, keyed by the person and the folded name.
 */
describe('the last-name dismissals', () => {
	const surnames = () => createDrizzleSurnameDismissalRepository(db);
	const entry = { id: 's-1', householdId: H, contactId: 'lea', folded: 'van der berg', dismissedBy: U1, dismissedAt: 3_000 };

	it('reads back a declined name, once however often it is declined', async () => {
		await surnames().dismiss(entry);
		await surnames().dismiss({ ...entry, id: 's-2' });
		expect(await surnames().listForHousehold(viewer)).toEqual([{ contactId: 'lea', folded: 'van der berg' }]);
	});

	it('stays out of the relationship log, and keeps its rows out of it', async () => {
		await repo.dismiss(dismissal());
		await surnames().dismiss(entry);
		expect((await repo.listForHousehold(viewer)).map((d) => d.relation)).toEqual(['parent']);
		expect(await surnames().listForHousehold(viewer)).toHaveLength(1);
	});

	it('never crosses a household', async () => {
		await surnames().dismiss(entry);
		expect(await surnames().listForHousehold(otherViewer)).toEqual([]);
		expect(await surnames().restore(otherViewer, 'lea', 'van der berg')).toBe(false);
	});

	it('takes a no back', async () => {
		await surnames().dismiss(entry);
		expect(await surnames().restore(viewer, 'lea', 'van der berg')).toBe(true);
		expect(await surnames().listForHousehold(viewer)).toEqual([]);
	});
});
