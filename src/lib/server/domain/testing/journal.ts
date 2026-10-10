import type { JournalEntry, JournalRepository } from '../journal/journal';

/*
 * Fakes of the journal's port (`journal/journal.ts`). As with the other fakes, an entry a test
 * hands in is one the viewer may see: scoping is the access layer's job, covered against SQLite
 * in `db/journal-repository.test.ts`.
 */

/** A shared entry on Anna by `u1` on 9 October 2026, plus whatever the test is about. */
export function someJournalEntry(
	id: string,
	fields: Partial<Omit<JournalEntry, 'id'>> = {}
): JournalEntry {
	return {
		id,
		contactId: 'anna',
		createdBy: 'u1',
		visibility: 'shared',
		entryDate: '2026-10-09',
		title: null,
		body: 'A walk by the river',
		createdAt: 1000,
		updatedAt: 1000,
		...fields
	};
}

/** Every method of the port: a method added to it and not here fails to compile. */
const JOURNAL_REPOSITORY_METHODS: Record<keyof JournalRepository, true> = {
	findDay: true,
	insert: true,
	updateBody: true,
	updateOwn: true,
	listForContactVisibleTo: true,
	listPageForContactVisibleTo: true,
	findRemovableBy: true,
	deleteRemovableBy: true,
	replaceMentions: true,
	listMentionedContactIds: true
};

/**
 * A `JournalRepository` that does what the test hands it and fails loud on anything else (as
 * `contactRepositoryWith`). The writes a test records are its own: that is what it asserts.
 */
export function journalRepositoryWith(methods: Partial<JournalRepository>): JournalRepository {
	const unexpected = (name: string) => async () => {
		throw new Error(`JournalRepository.${name} was not expected in this test`);
	};
	const stubs = Object.fromEntries(
		Object.keys(JOURNAL_REPOSITORY_METHODS).map((name) => [name, unexpected(name)])
	) as unknown as JournalRepository;
	return { ...stubs, ...methods };
}
