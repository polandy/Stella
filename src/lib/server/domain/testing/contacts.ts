import type { ContactNameReads } from '../contacts/contact-names';
import type { ContactRepository, ContactSummary } from '../contacts/contacts';
import type { ContactDirectoryReads } from '../contacts/directory';

/*
 * In-memory read models of the household's people. The people a fake is built over are the
 * ones the viewer may see: deciding *that* is the access layer's job, covered against SQLite in
 * `db/*-reads.test.ts`, so a fake does not re-implement it. What it does keep is the one rule
 * every list depends on — archived people are out of the browsing scope (docs/03 §3.3).
 */

/** One person a fake holds: their list row, and whether they are archived. */
export interface FakePerson extends ContactSummary {
	archived: boolean;
}

/** A person with every optional field empty, plus whatever the test is about. */
export function somebody(
	id: string,
	displayName: string,
	fields: Partial<Omit<FakePerson, 'id' | 'displayName'>> = {}
): FakePerson {
	return {
		id,
		displayName,
		firstName: null,
		lastName: null,
		nickname: null,
		formerName: null,
		description: null,
		metPlace: null,
		metDate: null,
		visibility: 'shared',
		avatarPhotoId: null,
		birthDate: null,
		jobTitle: null,
		company: null,
		archived: false,
		...fields
	};
}

const rowOf = ({ archived: _archived, ...row }: FakePerson): ContactSummary => row;
const byName = (a: FakePerson, b: FakePerson) => a.displayName.localeCompare(b.displayName);

/** `ContactDirectoryReads` over a fixed list of people. */
export function inMemoryContactDirectory(people: readonly FakePerson[]): ContactDirectoryReads {
	const browsable = () => people.filter((p) => !p.archived).sort(byName);
	const archived = () => people.filter((p) => p.archived).sort(byName);
	return {
		listVisibleTo: async () => browsable().map(rowOf),
		listArchivedVisibleTo: async () => archived().map(rowOf),
		countArchivedVisibleTo: async () => archived().length,
		listSomeBrowsableIdsVisibleTo: async (_viewer, limit) =>
			browsable()
				.slice(0, limit)
				.map((p) => p.id),
		listDistinguishableVisibleTo: async () =>
			browsable().map(({ id, displayName, lastName, description, metPlace, metDate }) => ({
				id,
				displayName,
				lastName,
				description,
				metPlace,
				metDate
			}))
	};
}

/** `ContactNameReads` over a fixed list of people, answering in the order they were given. */
export function inMemoryContactNames(people: readonly FakePerson[]): ContactNameReads {
	const among = (ids: readonly string[], keep: (p: FakePerson) => boolean) =>
		people
			.filter((p) => ids.includes(p.id) && keep(p))
			.map(({ id, displayName }) => ({ id, displayName }));
	return {
		listNamesAmongVisibleTo: async (_viewer, ids) => among(ids, () => true),
		listBrowsableNamesAmong: async (_viewer, ids) => among(ids, (p) => !p.archived)
	};
}

/** Every method of the port: a method added to it and not here fails to compile. */
const CONTACT_REPOSITORY_METHODS: Record<keyof ContactRepository, true> = {
	insert: true,
	findByIdVisibleTo: true,
	updateProfile: true,
	setGender: true,
	setJob: true,
	setArchived: true,
	writeNames: true,
	deleteVisibleTo: true,
	readForMerge: true,
	mergeVisibleTo: true
};

/**
 * A `ContactRepository` that does what the test hands it and fails loud on anything else, so
 * a test spells out only the methods its use-case calls — and learns when that changes. The
 * methods a test records calls on are its own: that is the behaviour it asserts.
 */
export function contactRepositoryWith(methods: Partial<ContactRepository>): ContactRepository {
	const unexpected = (name: string) => async () => {
		throw new Error(`ContactRepository.${name} was not expected in this test`);
	};
	const stubs = Object.fromEntries(
		Object.keys(CONTACT_REPOSITORY_METHODS).map((name) => [name, unexpected(name)])
	) as unknown as ContactRepository;
	return { ...stubs, ...methods };
}
