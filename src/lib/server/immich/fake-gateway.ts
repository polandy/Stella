import type {
	ImmichFailure,
	ImmichGateway,
	ImmichOutcome,
	ImmichOwner,
	ImmichPerson,
	ImmichVersion
} from '../domain/immich/gateway';
import { solidPng } from './png';

/*
 * An Immich that lives in memory (docs/concepts/immich.md §6): the use-case tests drive it, and
 * the demo/e2e server wires it with `IMMICH_DEMO=true`, so the feature can be tried and tested
 * without a real Immich. It answers the way the HTTP adapter does — hidden people never come
 * back from a listing or a search — and any call can be made to fail with a given outcome.
 */

/** A person in the fake library, with the photo count their statistics report. */
export interface FakeImmichPerson extends ImmichPerson {
	assets: number;
	/** The colour of their face tile, `#rrggbb`. */
	color: string;
}

export interface FakeImmichLibrary {
	version: ImmichVersion;
	owner: ImmichOwner;
	people: FakeImmichPerson[];
}

/** Which calls fail, and how; the test (or nobody, on the demo server) sets it. */
export type FakeFailures = Partial<Record<keyof ImmichGateway, ImmichFailure>>;

/** Side of a face tile, in pixels — about what Immich serves for a person thumbnail. */
const FACE_SIZE = 96;

export interface FakeImmichGateway extends ImmichGateway {
	/** Make calls fail from now on; an empty object makes them answer again. */
	failing: FakeFailures;
	/** Every call made, in order, so a test can tell what was — and was not — asked. */
	readonly calls: (keyof ImmichGateway)[];
	/** The library itself, so a test can delete a person "in Immich". */
	readonly library: FakeImmichLibrary;
}

export function createFakeImmichGateway(library: FakeImmichLibrary): FakeImmichGateway {
	const fake: FakeImmichGateway = {
		failing: {},
		calls: [],
		library,
		version: () => answer('version', () => library.version),
		owner: () => answer('owner', () => library.owner),
		listPeople: (page, size) =>
			answer('listPeople', () => {
				const shown = library.people.filter((p) => !p.hidden);
				const from = (page - 1) * size;
				return { people: shown.slice(from, from + size).map(asPerson), hasNextPage: from + size < shown.length };
			}),
		searchPeople: (name) =>
			answer('searchPeople', () => {
				const wanted = name.trim().toLowerCase();
				return library.people
					.filter((p) => !p.hidden && p.name.toLowerCase().includes(wanted))
					.map(asPerson);
			}),
		person: (id) => answer('person', () => found(id), true),
		personStatistics: (id) => answer('personStatistics', () => {
			const person = found(id);
			return person && { assets: person.assets };
		}, true),
		personThumbnail: (id) =>
			answer('personThumbnail', () => {
				const person = found(id);
				return person && { bytes: solidPng(FACE_SIZE, person.color), contentType: 'image/png' };
			}, true)
	};

	function found(id: string): FakeImmichPerson | null {
		return library.people.find((p) => p.id === id) ?? null;
	}

	async function answer<T>(
		call: keyof ImmichGateway,
		read: () => T | null,
		byId = false
	): Promise<ImmichOutcome<T>> {
		fake.calls.push(call);
		const failure = fake.failing[call];
		if (failure) return { ok: false, failure };
		const value = read();
		if (value === null && byId) return { ok: false, failure: 'notFound' };
		return { ok: true, value: value as T };
	}

	return fake;
}

function asPerson({ id, name, hidden }: FakeImmichPerson): ImmichPerson {
	return { id, name, hidden };
}
