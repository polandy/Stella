import type {
	ImmichAsset,
	ImmichFailure,
	ImmichGateway,
	ImmichImageSize,
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
 *
 * A person's photos are not stored: there are `assets` of them, numbered newest first, and each
 * one's id, day and tile are worked out from its number (`fakeAssetId`). A photo is a tile in a
 * lighter or darker shade of the person's colour, so a strip of them reads as distinct pictures.
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

/** Side of a photo tile at each size; small, because the demo builds them on every request. */
const PHOTO_SIZE: Record<ImmichImageSize, number> = { thumbnail: 96, preview: 320 };

/** The day the newest fake photo was taken; each older one is a day before the last. */
const NEWEST_PHOTO_DAY = Date.UTC(2026, 8, 1);
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The id of a person's `index`-th photo, newest first: the index in the first group of the UUID,
 * the person's id in the rest. Reversible, so the fake needs no table of photos.
 */
export function fakeAssetId(personId: string, index: number): string {
	return `${index.toString(16).padStart(8, '0')}${personId.slice(8)}`;
}

/** A shade of `hex` — lighter or darker by the photo's place in the strip. */
function shade(hex: string, index: number): string {
	const amount = ((index % 5) - 2) * 0.15;
	const channel = (at: number) => {
		const value = Number.parseInt(hex.slice(at, at + 2), 16);
		const moved = amount >= 0 ? value + (255 - value) * amount : value * (1 + amount);
		return Math.round(moved).toString(16).padStart(2, '0');
	};
	return `#${channel(1)}${channel(3)}${channel(5)}`;
}

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
			}, true),
		latestAssets: (personId, limit, cursor) =>
			answer('latestAssets', () => {
				const person = found(personId);
				if (!person) return null;
				const from = cursor === null ? 0 : Number.parseInt(cursor, 10) || 0;
				const to = Math.min(from + limit, person.assets);
				const assets: ImmichAsset[] = [];
				for (let index = from; index < to; index++) {
					const day = new Date(NEWEST_PHOTO_DAY - index * DAY_MS).toISOString().slice(0, 10);
					assets.push({ id: fakeAssetId(person.id, index), takenOn: day });
				}
				return { assets, nextCursor: to < person.assets ? String(to) : null };
			}, true),
		assetImage: (assetId, size) =>
			answer('assetImage', () => {
				const index = Number.parseInt(assetId.slice(0, 8), 16);
				const person = library.people.find((p) => p.id.slice(8) === assetId.slice(8));
				if (!person || !(index < person.assets)) return null;
				return { bytes: solidPng(PHOTO_SIZE[size], shade(person.color, index)), contentType: 'image/png' };
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
