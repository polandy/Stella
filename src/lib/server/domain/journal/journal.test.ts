import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import { someJournalEntry } from '../testing/journal';
import {
	addToJournalDay,
	editJournalEntry,
	EmptyJournalEntryError,
	InvalidJournalDayError,
	saveJournalEntry,
	listJournalForContact,
	type JournalAuthor,
	type JournalEntry,
	type JournalDeps,
	type NewJournalEntry
} from './journal';
import { NoJournalSubjectError } from './subjects';

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

const keyOf = (ids: readonly string[]) => [...ids].sort().join(',');

/** In-memory fake of the JournalRepository, enough to exercise the pure use-cases. */
function fakeRepo(seed: JournalEntry[] = []) {
	const rows = [...seed];
	const mentions = new Map<string, string[]>();
	const tags = new Map<string, string[]>();
	const repo = {
		rows,
		tags,
		async findDay(p: {
			authorId: string;
			subjectIds: readonly string[];
			entryDate: string;
			visibility: string;
		}) {
			return (
				rows.find(
					(r) =>
						r.createdBy === p.authorId &&
						keyOf(r.subjectIds) === keyOf(p.subjectIds) &&
						r.entryDate === p.entryDate &&
						r.visibility === p.visibility
				) ?? null
			);
		},
		async insert(e: NewJournalEntry) {
			rows.push({ ...e, subjectIds: [...e.subjectIds] });
		},
		async updateBody(p: { id: string; title: string | null; body: string; updatedAt: number }) {
			const row = rows.find((r) => r.id === p.id);
			if (!row) throw new Error('no such entry');
			row.title = p.title;
			row.body = p.body;
			row.updatedAt = p.updatedAt;
		},
		async updateOwn(p: {
			authorId: string;
			id: string;
			title: string | null;
			body: string;
			updatedAt: number;
		}) {
			const row = rows.find((r) => r.id === p.id && r.createdBy === p.authorId);
			if (!row) return false;
			row.title = p.title;
			row.body = p.body;
			row.updatedAt = p.updatedAt;
			return true;
		},
		async setSubjectsOwn(p: {
			authorId: string;
			id: string;
			subjectIds: readonly string[];
			updatedAt: number;
		}) {
			const row = rows.find((r) => r.id === p.id && r.createdBy === p.authorId);
			if (!row) return null;
			row.subjectIds = [...p.subjectIds];
			row.contactId = p.subjectIds[0];
			return row.id;
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
				.sort((a, b) =>
					b.entryDate < a.entryDate ? -1 : b.entryDate > a.entryDate ? 1 : b.createdAt - a.createdAt
				);
			const after = opts.before
				? sorted.filter(
						(r) =>
							r.entryDate < opts.before!.entryDate ||
							(r.entryDate === opts.before!.entryDate && r.createdAt < opts.before!.createdAt)
					)
				: sorted;
			return after.slice(0, opts.limit);
		},
		async findRemovableBy() {
			return null;
		},
		async deleteRemovableBy() {
			return null;
		},
		async replaceMentions(journalEntryId: string, contactIds: string[]) {
			mentions.set(journalEntryId, [...contactIds]);
		},
		async listMentionedContactIds(journalEntryId: string) {
			return mentions.get(journalEntryId) ?? [];
		},
		async replaceTags(journalEntryId: string, names: string[]) {
			tags.set(journalEntryId, [...names]);
		}
	};
	return repo;
}

function deps(repo = fakeRepo()): JournalDeps & {
	repo: ReturnType<typeof fakeRepo>;
	removedFiles: string[];
} {
	let seq = 0;
	const removedFiles: string[] = [];
	return {
		repo,
		removedFiles,
		journal: repo,
		media: {
			delete: async (path: string) => {
				removedFiles.push(path);
			}
		},
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
			subjectIds: ['c1'],
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
		await saveJournalEntry(d, author, {
			contactId: 'c1',
			entryDate: '2026-07-11',
			body: 'shared moment',
			visibility: 'shared'
		});
		await saveJournalEntry(d, author, {
			contactId: 'c1',
			entryDate: '2026-07-11',
			body: 'just for me',
			visibility: 'private'
		});
		expect(d.repo.rows).toHaveLength(2);
		expect(d.repo.rows.map((r) => r.visibility).sort()).toEqual(['private', 'shared']);
	});

	it('rejects an empty body', async () => {
		const d = deps();
		await expect(
			saveJournalEntry(d, author, { contactId: 'c1', entryDate: '2026-07-11', body: '   ' })
		).rejects.toBeInstanceOf(EmptyJournalEntryError);
	});

	it('rejects a malformed date', async () => {
		const d = deps();
		await expect(
			saveJournalEntry(d, author, { contactId: 'c1', entryDate: '11.07.2026', body: 'x' })
		).rejects.toBeInstanceOf(InvalidJournalDayError);
	});
});

/*
 * An entry's tags are what its text says (docs/02 §2.20.2): every write reads them from the
 * body it leaves behind and hands them to the port, which keeps the household's tag set.
 */
describe('tags from the text', () => {
	it('saves the tags a new entry is written with', async () => {
		const d = deps();
		const id = await saveJournalEntry(d, author, {
			contactId: 'c1',
			entryDate: '2026-07-11',
			body: 'Swim in the #lake, a #Holiday and more #holiday'
		});
		expect(d.repo.tags.get(id)).toEqual(['lake', 'Holiday']);
	});

	it('reads them again when the same slot is written over', async () => {
		const d = deps();
		const input = { contactId: 'c1', entryDate: '2026-07-11', body: '#lake' };
		const id = await saveJournalEntry(d, author, input);
		await saveJournalEntry(d, author, { ...input, body: 'no tags now' });
		expect(d.repo.tags.get(id)).toEqual([]);
	});

	it('takes the whole day when a moment is added to it', async () => {
		const d = deps();
		const addition = {
			contactId: 'c1',
			entryDate: '2026-07-11',
			visibility: 'shared' as const,
			title: null,
			mentionIds: []
		};
		const id = await addToJournalDay(d, author, { ...addition, body: 'Morning #walk' });
		await addToJournalDay(d, author, { ...addition, body: 'Evening #lake' });
		expect(d.repo.tags.get(id)).toEqual(['walk', 'lake']);
	});

	it('rebuilds them from an edit of an own entry, and leaves another’s alone', async () => {
		const d = deps(
			fakeRepo([
				someJournalEntry('e1', { createdBy: 'u1', body: '#lake' }),
				someJournalEntry('e2', { createdBy: 'u2', body: '#lake' })
			])
		);
		const edit = { body: 'Now a #hike', mentionIds: [], subjectIds: ['anna'] };
		await editJournalEntry(d, author, { id: 'e1', ...edit });
		await editJournalEntry(d, author, { id: 'e2', ...edit });
		expect(d.repo.tags.get('e1')).toEqual(['hike']);
		expect(d.repo.tags.has('e2')).toBe(false);
	});
});

describe('listJournalForContact', () => {
	it('delegates to the visibility-scoped repository', async () => {
		const repo = fakeRepo([
			{
				id: 'a',
				contactId: 'c1',
				subjectIds: ['c1'],
				createdBy: 'u1',
				visibility: 'shared',
				entryDate: '2026-07-10',
				title: null,
				body: 'x',
				createdAt: 1,
				updatedAt: 1
			}
		]);
		const list = await listJournalForContact({ journal: repo }, viewer, 'c1');
		expect(list).toHaveLength(1);
		expect(list[0].id).toBe('a');
	});
});

/*
 * Editing changes the text of an existing entry in place; the day and visibility stay put,
 * since those are the slot the entry occupies (docs/02 §2.20).
 */
describe('editJournalEntry', () => {
	it('updates the title and body of an owned entry', async () => {
		const d = deps(
			fakeRepo([
				{
					id: 'e1',
					contactId: 'c1',
					subjectIds: ['c1'],
					createdBy: 'u1',
					visibility: 'shared',
					entryDate: '2026-07-11',
					title: 'Old',
					body: 'draft',
					createdAt: 1,
					updatedAt: 1
				}
			])
		);
		const ok = await editJournalEntry(d, author, {
			id: 'e1',
			title: 'New',
			body: 'expanded draft',
			mentionIds: [],
			subjectIds: ['c1']
		});
		expect(ok).toBe('e1');
		expect(d.repo.rows[0]).toMatchObject({ title: 'New', body: 'expanded draft', updatedAt: 1000 });
		// the slot itself is untouched
		expect(d.repo.rows[0]).toMatchObject({ entryDate: '2026-07-11', visibility: 'shared' });
	});

	it('returns null for an entry that is not the author’s own', async () => {
		const d = deps(
			fakeRepo([
				{
					id: 'e1',
					contactId: 'c1',
					subjectIds: ['c1'],
					createdBy: 'someone-else',
					visibility: 'shared',
					entryDate: '2026-07-11',
					title: null,
					body: 'draft',
					createdAt: 1,
					updatedAt: 1
				}
			])
		);
		expect(
			await editJournalEntry(d, author, {
				id: 'e1',
				body: 'hijacked',
				mentionIds: [],
				subjectIds: ['c1']
			})
		).toBeNull();
		expect(d.repo.rows[0].body).toBe('draft');
	});

	it('rejects an empty body', async () => {
		const d = deps(
			fakeRepo([
				{
					id: 'e1',
					contactId: 'c1',
					subjectIds: ['c1'],
					createdBy: 'u1',
					visibility: 'shared',
					entryDate: '2026-07-11',
					title: null,
					body: 'draft',
					createdAt: 1,
					updatedAt: 1
				}
			])
		);
		await expect(
			editJournalEntry(d, author, { id: 'e1', body: '   ', mentionIds: [], subjectIds: ['c1'] })
		).rejects.toBeInstanceOf(EmptyJournalEntryError);
	});
});

/*
 * A moment about several people (docs/02 §2.20.3, ADR-131): the first is the anchor, the slot
 * is the set of them, and a subject is never also a mention.
 */
describe('a moment about several people', () => {
	const day = { entryDate: '2026-07-11', visibility: 'shared' as const, title: null };

	it('stores everyone, the anchor first, and keys the slot by the set', async () => {
		const d = deps();
		const first = await addToJournalDay(d, author, {
			...day,
			contactId: 'markus',
			furtherSubjectIds: ['sandra', 'markus'],
			body: 'Zoo',
			mentionIds: []
		});
		const again = await addToJournalDay(d, author, {
			...day,
			contactId: 'sandra',
			furtherSubjectIds: ['markus'],
			body: 'Ice cream',
			mentionIds: []
		});
		expect(again).toBe(first);
		expect(d.repo.rows).toHaveLength(1);
		expect(d.repo.rows[0]).toMatchObject({ contactId: 'markus', subjectIds: ['markus', 'sandra'] });
	});

	it('keeps a different set of people a separate slot that day', async () => {
		const d = deps();
		const add = { ...day, contactId: 'markus', body: 'x', mentionIds: [] };
		await addToJournalDay(d, author, add);
		await addToJournalDay(d, author, { ...add, furtherSubjectIds: ['sandra'] });
		expect(d.repo.rows).toHaveLength(2);
	});

	it('drops a subject from the mentions, so nobody is counted twice', async () => {
		const d = deps();
		const id = await addToJournalDay(d, author, {
			...day,
			contactId: 'markus',
			furtherSubjectIds: ['sandra'],
			body: 'With @Sandra and @Oma',
			mentionIds: ['sandra', 'oma']
		});
		expect(await d.repo.listMentionedContactIds(id)).toEqual(['oma']);
	});

	it('edits the people, the first becoming the anchor', async () => {
		const d = deps(fakeRepo([someJournalEntry('e1', { contactId: 'markus', createdBy: 'u1' })]));
		const id = await editJournalEntry(d, author, {
			id: 'e1',
			body: 'Zoo with @Sandra',
			mentionIds: ['sandra'],
			subjectIds: ['sandra', 'lea', 'sandra']
		});
		expect(id).toBe('e1');
		expect(d.repo.rows[0]).toMatchObject({ contactId: 'sandra', subjectIds: ['sandra', 'lea'] });
		expect(await d.repo.listMentionedContactIds('e1')).toEqual([]);
	});

	it('refuses to leave a moment about nobody: that is removing it', async () => {
		const d = deps(fakeRepo([someJournalEntry('e1', { createdBy: 'u1' })]));
		await expect(
			editJournalEntry(d, author, { id: 'e1', body: 'x', mentionIds: [], subjectIds: [] })
		).rejects.toBeInstanceOf(NoJournalSubjectError);
		expect(d.repo.rows[0].subjectIds).toEqual(['anna']);
	});
});
