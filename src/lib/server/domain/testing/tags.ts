import type { Tag } from '../tags/tags';
import type { TagListReads } from '../tags/tag-lists';
import type { FakePerson } from './contacts';

/*
 * An in-memory read model of the household's tags. The people it is built over are the ones the
 * viewer may see (as in `contacts.ts`); the scoping is covered against SQLite in
 * `db/tag-list-reads.test.ts`.
 */

/** A tag, and the ids of the people who carry it. */
export interface FakeTag extends Tag {
	carriedBy: readonly string[];
}

/** A tag of the test household that nobody carries, plus whatever the test is about. */
export function someTag(
	id: string,
	name: string,
	fields: Partial<Omit<FakeTag, 'id' | 'name'>> = {}
): FakeTag {
	return { id, householdId: 'h', name, color: 'blue', carriedBy: [], ...fields };
}

const tagOf = ({ carriedBy: _carriedBy, ...tag }: FakeTag): Tag => tag;
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/**
 * `TagListReads` over fixed tags and people. Archived people still carry their tags and show
 * under them: the adapter reads a tag's people by visibility alone, not the browsing scope.
 */
export function inMemoryTagLists(
	tags: readonly FakeTag[],
	people: readonly FakePerson[] = []
): TagListReads {
	const sorted = () => [...tags].sort(byName);
	return {
		listByHousehold: async (householdId) =>
			sorted()
				.filter((t) => t.householdId === householdId)
				.map(tagOf),
		listForContactVisibleTo: async (_viewer, contactId) =>
			sorted()
				.filter((t) => t.carriedBy.includes(contactId))
				.map(tagOf),
		listContactsByTagVisibleTo: async (_viewer, tagId) => {
			const carriers = tags.find((t) => t.id === tagId)?.carriedBy ?? [];
			return people
				.filter((p) => carriers.includes(p.id))
				.sort((a, b) => a.displayName.localeCompare(b.displayName))
				.map(({ archived: _archived, ...row }) => row);
		}
	};
}
