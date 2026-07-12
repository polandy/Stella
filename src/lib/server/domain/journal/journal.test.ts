import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import {
	saveJournalEntry,
	listJournalForContact,
	type JournalAuthor,
	type JournalEntry,
	type JournalDeps,
	type NewJournalEntry
} from './journal';

/*
 * Journal use-cases (docs/02 §2.20). A journal entry is a per-person, per-day diary entry
 * authored by a household member. Uniqueness is per (contact, author, day, visibility): each
 * member gets at most one shared and one private entry for a given contact on a given day, so
 * saving the same slot again *edits* it rather than piling up duplicates. Visibility follows
 * the child-record rule (private ⇒ only the author). Orchestration is pure; scoping lives in
 * the adapter.
 */

const author: JournalAuthor = { userId: 'u1', householdId: 'h1', defaultVisibility: 'shared' };
const viewer: Viewer = { id: 'u1', householdId: 'h1' };

/** In-memory fake of the JournalRepository, enough to exercise the pure use-cases. */
function fakeRepo(seed: JournalEntry[] = []) {
	const rows = [...seed];
	const mentions = new Map<string, string[]>();
	const repo = {
		rows,
		async findDay(p: { authorId: string; contactId: string; entryDate: string; visibility: string }) {
			return (
				rows.find(
					(r) =>
						r.createdBy === p.authorId &&
						r.contactId === p.contactId &&
						r.entryDate === p.entryDate &&
						r.visibility === p.visibility
				) ?? null
			);
		},
		async insert(e: NewJournalEntry) {
			rows.push({ ...e });
		},
		async updateBody(p: { id: string; title: string | null; body: string; updatedAt: number }) {
			const row = rows.find((r) => r.id === p.id);
			if (!row) throw new Error('no such entry');
			row.title = p.title;
			row.body = p.body;
			row.updatedAt = p.updatedAt;
		},
		async listForContactVisibleTo(_v: Viewer, contactId: string) {
			return rows.filter((r) => r.contactId === contactId);
		},
		async listPageForContactVisibleTo(
			_v: Viewer,
			contactId: string,
			opts: { limit: number; before?: { entryDate: string; createdAt: number } }
		) {
			const sorted = rows
				.filter((r) => r.contactId === contactId)
				.sort((a, b) => (b.entryDate < a.entryDate ? -1 : b.entryDate > a.entryDate ? 1 : b.createdAt - a.createdAt));
			const after = opts.before
				? sorted.filter(
						(r) =>
							r.entryDate < opts.before!.entryDate ||
							(r.entryDate === opts.before!.entryDate && r.createdAt < opts.before!.createdAt)
					)
				: sorted;
			return after.slice(0, opts.limit);
		},
		async deleteOwn(p: { authorId: string; id: string }) {
			const i = rows.findIndex((r) => r.id === p.id && r.createdBy === p.authorId);
			if (i < 0) return false;
			rows.splice(i, 1);
			return true;
		},
		async replaceMentions(journalEntryId: string, contactIds: string[]) {
			mentions.set(journalEntryId, [...contactIds]);
		},
		async listMentionedContactIds(journalEntryId: string) {
			return mentions.get(journalEntryId) ?? [];
		}
	};
	return repo;
}

function deps(repo = fakeRepo()): JournalDeps & { repo: ReturnType<typeof fakeRepo> } {
	let seq = 0;
	return {
		repo,
		journal: repo,
		ids: { next: () => `id-${++seq}` },
		clock: { now: () => 1000 }
	};
}

describe('saveJournalEntry', () => {
	it('creates a new entry for a day, defaulting to the author default visibility', async () => {
		const d = deps();
		const id = await saveJournalEntry(d, author, {
			contactId: 'c1',
			entryDate: '2026-07-11',
			body: 'First steps in the garden 🌱'
		});
		expect(id).toBe('id-1');
		expect(d.repo.rows).toHaveLength(1);
		expect(d.repo.rows[0]).toMatchObject({
			contactId: 'c1',
			createdBy: 'u1',
			visibility: 'shared',
			entryDate: '2026-07-11',
			body: 'First steps in the garden 🌱',
			createdAt: 1000,
			updatedAt: 1000
		});
	});

	it('edits the same day/visibility slot instead of creating a duplicate', async () => {
		const d = deps();
		const first = await saveJournalEntry(d, author, {
			contactId: 'c1',
			entryDate: '2026-07-11',
			body: 'draft'
		});
		const second = await saveJournalEntry(d, author, {
			contactId: 'c1',
			entryDate: '2026-07-11',
			body: 'draft, expanded',
			title: 'Garden day'
		});
		expect(second).toBe(first); // same slot → same id
		expect(d.repo.rows).toHaveLength(1);
		expect(d.repo.rows[0]).toMatchObject({ body: 'draft, expanded', title: 'Garden day' });
	});

	it('keeps a private and a shared entry as separate slots for the same day', async () => {
		const d = deps();
		await saveJournalEntry(d, author, { contactId: 'c1', entryDate: '2026-07-11', body: 'shared moment', visibility: 'shared' });
		await saveJournalEntry(d, author, { contactId: 'c1', entryDate: '2026-07-11', body: 'just for me', visibility: 'private' });
		expect(d.repo.rows).toHaveLength(2);
		expect(d.repo.rows.map((r) => r.visibility).sort()).toEqual(['private', 'shared']);
	});

	it('rejects an empty body', async () => {
		const d = deps();
		await expect(
			saveJournalEntry(d, author, { contactId: 'c1', entryDate: '2026-07-11', body: '   ' })
		).rejects.toThrow();
	});

	it('rejects a malformed date', async () => {
		const d = deps();
		await expect(
			saveJournalEntry(d, author, { contactId: 'c1', entryDate: '11.07.2026', body: 'x' })
		).rejects.toThrow();
	});
});

describe('listJournalForContact', () => {
	it('delegates to the visibility-scoped repository', async () => {
		const repo = fakeRepo([
			{ id: 'a', contactId: 'c1', createdBy: 'u1', visibility: 'shared', entryDate: '2026-07-10', title: null, body: 'x', createdAt: 1, updatedAt: 1 }
		]);
		const list = await listJournalForContact({ journal: repo }, viewer, 'c1');
		expect(list).toHaveLength(1);
		expect(list[0].id).toBe('a');
	});
});
