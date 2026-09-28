import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import type { Contact, ContactSummary } from '../contacts/contacts';
import { ContactGoneError } from '../contacts/require-visible';
import type { JournalEntry, NewJournalEntry } from './journal';
import { writeJournalEntry, type WriteJournalEntryDeps } from './write-entry';

/*
 * Writing on a person's journal page (docs/02 §2.20) as one use-case, so the page and an entry
 * kept on a phone (`journal.write`, docs/concepts/offline-capture.md §4.1) go through the same
 * checks. Writing is an addition: a day that already holds an entry gets the new text appended,
 * as a moment does (§2.22.1) — a kept entry arriving late must never overwrite what was
 * written meanwhile.
 */

const author = { userId: 'u1', householdId: 'h1' };
const person = (
	id: string,
	visibility: 'shared' | 'private' = 'shared',
	createdBy = 'u2'
): ContactSummary & { createdBy: string } => ({
	id,
	displayName: id[0].toUpperCase() + id.slice(1),
	firstName: null,
	lastName: null,
	nickname: null,
	description: null,
	visibility,
	avatarPhotoId: null,
	birthDate: null,
	createdBy
});

function fakes(people = [person('julia'), person('marco'), person('sam', 'private', 'u1')]) {
	let n = 0;
	const entries: JournalEntry[] = [];
	const mentions = new Map<string, string[]>();
	const visible = (v: Viewer) => people.filter((p) => p.visibility === 'shared' || p.createdBy === v.id);
	const deps: WriteJournalEntryDeps = {
		contacts: {
			async findByIdVisibleTo(v, id) {
				return (visible(v).find((p) => p.id === id) as unknown as Contact) ?? null;
			},
			async listVisibleTo(v) {
				return visible(v);
			}
		},
		journal: {
			async findDay(p) {
				return (
					entries.find(
						(e) =>
							e.createdBy === p.authorId &&
							e.contactId === p.contactId &&
							e.entryDate === p.entryDate &&
							e.visibility === p.visibility
					) ?? null
				);
			},
			async insert(e: NewJournalEntry) {
				entries.push({ ...e });
			},
			async updateBody(p) {
				const e = entries.find((x) => x.id === p.id)!;
				e.title = p.title;
				e.body = p.body;
				e.updatedAt = p.updatedAt;
			},
			async replaceMentions(id, ids) {
				mentions.set(id, ids);
			},
			async listMentionedContactIds(id) {
				return mentions.get(id) ?? [];
			}
		},
		ids: { next: () => `e${++n}` },
		clock: { now: () => 7 }
	};
	return { deps, entries, mentions };
}

const base = {
	contactId: 'julia',
	entryDate: '2026-09-28',
	title: null,
	visibility: 'shared' as const
};

describe('writeJournalEntry', () => {
	it('writes an entry on the person’s day, resolving mentions and leaving the subject out of them', async () => {
		const f = fakes();
		const result = await writeJournalEntry(f.deps, author, {
			...base,
			title: 'Lake day',
			body: 'Swam with @Marco, @Julia froze'
		});

		expect(result).toEqual({
			entryId: 'e1',
			anchorContactId: 'julia',
			visibility: 'shared'
		});
		expect(f.entries).toMatchObject([
			{
				id: 'e1',
				contactId: 'julia',
				createdBy: 'u1',
				title: 'Lake day',
				body: 'Swam with @{contact:marco}, @{contact:julia} froze'
			}
		]);
		expect(f.mentions.get('e1')).toEqual(['marco']);
	});

	it('appends to the day’s entry instead of replacing it, keeping its title and mentions', async () => {
		const f = fakes();
		await writeJournalEntry(f.deps, author, {
			...base,
			title: 'Lake day',
			body: 'Swam with @Marco'
		});
		const second = await writeJournalEntry(f.deps, author, {
			...base,
			title: 'Evening',
			body: 'Pizza after'
		});

		expect(second.entryId).toBe('e1');
		expect(f.entries).toHaveLength(1);
		expect(f.entries[0].body).toBe('Swam with @{contact:marco}\n\nPizza after');
		expect(f.entries[0].title).toBe('Lake day');
		expect(f.mentions.get('e1')).toEqual(['marco']);
	});

	it('gives an untitled day the title of what is added to it', async () => {
		const f = fakes();
		await writeJournalEntry(f.deps, author, { ...base, body: 'Morning walk' });
		await writeJournalEntry(f.deps, author, {
			...base,
			title: 'Birthday',
			body: 'Cake'
		});
		expect(f.entries[0].title).toBe('Birthday');
	});

	it('keeps another day, or the other audience, in an entry of its own', async () => {
		const f = fakes();
		await writeJournalEntry(f.deps, author, { ...base, body: 'One' });
		await writeJournalEntry(f.deps, author, {
			...base,
			entryDate: '2026-09-27',
			body: 'Two'
		});
		await writeJournalEntry(f.deps, author, {
			...base,
			visibility: 'private',
			body: 'Three'
		});
		expect(f.entries.map((e) => [e.entryDate, e.visibility, e.body])).toEqual([
			['2026-09-28', 'shared', 'One'],
			['2026-09-27', 'shared', 'Two'],
			['2026-09-28', 'private', 'Three']
		]);
	});

	it('resolves mentions only against the entry’s audience, so a shared entry never names a private person', async () => {
		const f = fakes();
		await writeJournalEntry(f.deps, author, { ...base, body: 'With @Sam' });
		expect(f.entries[0].body).toBe('With @Sam');
		expect(f.mentions.get('e1')).toEqual([]);

		await writeJournalEntry(f.deps, author, {
			...base,
			visibility: 'private',
			body: 'With @Sam'
		});
		expect(f.entries[1].body).toBe('With @{contact:sam}');
	});

	it('refuses an entry on a person the author cannot see, writing nothing', async () => {
		const f = fakes([person('julia'), person('hidden', 'private', 'u2')]);
		await expect(
			writeJournalEntry(f.deps, author, {
				...base,
				contactId: 'hidden',
				body: 'Hello'
			})
		).rejects.toBeInstanceOf(ContactGoneError);
		expect(f.entries).toHaveLength(0);

		await writeJournalEntry(f.deps, author, { ...base, body: 'Hello' });
		expect(f.entries).toHaveLength(1);
	});
});
