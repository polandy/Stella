/*
 * How Immich's answers are read (ADR-101). Every answer is untrusted — another program wrote it —
 * so each is read by a pure parser here and anything that is not what it claims is refused.
 */

import { isWholeDay } from '../../../dates/calendar';
import { isTakenAt } from '../../../media/taken-at';
import {
	isAssetCursor,
	isImmichId,
	type ImmichAlbum,
	type ImmichAsset,
	type ImmichAssetPage,
	type ImmichOwner,
	type ImmichPeoplePage,
	type ImmichPerson,
	type ImmichStatistics,
	type ImmichTimelineMonth,
	type ImmichVersion
} from './gateway';

type Payload = Record<string, unknown>;

const objectOf = (value: unknown): Payload | null =>
	typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Payload) : null;

const count = (value: unknown): number | null =>
	typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;

/** The server version, or null when the body is not one. */
export function readVersion(payload: unknown): ImmichVersion | null {
	const body = objectOf(payload);
	if (!body) return null;
	const [major, minor, patch] = [count(body.major), count(body.minor), count(body.patch)];
	if (major === null || minor === null || patch === null) return null;
	return { major, minor, patch };
}

/** The key's owner, or null without an email — Settings names whose library Stella reads by it. */
export function readOwner(payload: unknown): ImmichOwner | null {
	const body = objectOf(payload);
	if (!body || typeof body.email !== 'string' || body.email === '') return null;
	return { name: typeof body.name === 'string' ? body.name : '', email: body.email };
}

/** One person, or null when the id is not an Immich id. */
export function readPerson(payload: unknown): ImmichPerson | null {
	const body = objectOf(payload);
	if (!body || !isImmichId(body.id)) return null;
	return {
		id: body.id,
		name: typeof body.name === 'string' ? body.name.trim() : '',
		hidden: body.isHidden === true
	};
}

/** The people of a search answer (a bare list); unreadable entries are dropped. */
export function readPersonList(payload: unknown): ImmichPerson[] | null {
	if (!Array.isArray(payload)) return null;
	return payload.map(readPerson).filter((person): person is ImmichPerson => person !== null);
}

/** A page of the people listing, or null when the body is not one. */
export function readPeoplePage(payload: unknown): ImmichPeoplePage | null {
	const body = objectOf(payload);
	if (!body) return null;
	const people = readPersonList(body.people);
	if (!people) return null;
	return { people, hasNextPage: body.hasNextPage === true };
}

/** A person's photo count, or null when the body is not one. */
export function readStatistics(payload: unknown): ImmichStatistics | null {
	const body = objectOf(payload);
	const assets = body ? count(body.assets) : null;
	return assets === null ? null : { assets };
}

/** The `YYYY-MM-DDTHH:MM:SS` an Immich timestamp starts with, or null when it does not read as one. */
function secondsOf(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const seconds = value.slice(0, 19);
	return isTakenAt(seconds) ? seconds : null;
}

/**
 * When a photo was taken. `localDateTime` is the camera's wall clock, though Immich writes it with
 * a `Z`: kept without one, so the day is the one the photo was taken on where it was taken, as
 * Stella keeps an EXIF date (docs/dev/02 §2.14). `fileCreatedAt` is a true instant, kept as UTC.
 */
function takenAtOf(body: Payload): string | null {
	const local = secondsOf(body.localDateTime);
	if (local !== null) return local;
	const instant = secondsOf(body.fileCreatedAt);
	return instant === null ? null : `${instant}Z`;
}

/**
 * One photo of a search page, or null when it is not one Stella may show. The search already
 * asks for images in the timeline only; this reads each answer as if it had not, so a photo
 * archived, locked away, hidden or trashed in Immich is never passed on (docs/dev/02 §2.24.3).
 */
function readAsset(payload: unknown): ImmichAsset | null {
	const body = objectOf(payload);
	if (!body || !isImmichId(body.id)) return null;
	if (body.type !== 'IMAGE' || body.visibility !== 'timeline' || body.isTrashed === true)
		return null;
	return { id: body.id, takenAt: takenAtOf(body) };
}

/** A page of `POST /api/search/metadata`, or null when the body is not one. */
export function readAssetPage(payload: unknown): ImmichAssetPage | null {
	const assets = objectOf(objectOf(payload)?.assets);
	if (!assets || !Array.isArray(assets.items)) return null;
	return {
		assets: assets.items.map(readAsset).filter((asset): asset is ImmichAsset => asset !== null),
		nextCursor: isAssetCursor(assets.nextCursor) ? assets.nextCursor : null
	};
}

/** `YYYY-MM` of a bucket's `YYYY-MM-DD…` start. */
const BUCKET_START = /^(\d{4}-(?:0[1-9]|1[0-2]))-\d{2}(?:T.*)?$/;

/**
 * The months of `GET /api/timeline/buckets` (measured against Immich v3.3.1), or null when any
 * bucket is not one: a changed shape is refused whole rather than read as a smaller library.
 */
export function readTimelineMonths(payload: unknown): ImmichTimelineMonth[] | null {
	if (!Array.isArray(payload)) return null;
	const months: ImmichTimelineMonth[] = [];
	for (const value of payload) {
		const bucket = objectOf(value);
		const start = typeof bucket?.timeBucket === 'string' ? bucket.timeBucket : '';
		const month = BUCKET_START.exec(start)?.[1];
		const assets = count(bucket?.count);
		if (month === undefined || assets === null) return null;
		months.push({ month, count: assets });
	}
	return months;
}

/** The day an album's `startDate` or `endDate` starts with; undefined when it is not one. */
function albumDayOf(value: unknown): string | null | undefined {
	if (value === undefined || value === null) return null;
	const day = typeof value === 'string' ? value.slice(0, 10) : '';
	return isWholeDay(day) ? day : undefined;
}

/**
 * The albums of `GET /api/albums` (measured against Immich v3.3.1, which lists the albums shared
 * with the key's owner beside their own), or null when any is not one: a changed shape is refused
 * whole rather than read as fewer albums.
 */
export function readAlbums(payload: unknown): ImmichAlbum[] | null {
	if (!Array.isArray(payload)) return null;
	const albums: ImmichAlbum[] = [];
	for (const value of payload) {
		const album = objectOf(value);
		if (!album || !isImmichId(album.id) || typeof album.albumName !== 'string') return null;
		const assets = count(album.assetCount);
		const cover = album.albumThumbnailAssetId ?? null;
		const [from, to] = [albumDayOf(album.startDate), albumDayOf(album.endDate)];
		if (assets === null || (cover !== null && !isImmichId(cover))) return null;
		if (from === undefined || to === undefined || (from === null) !== (to === null)) return null;
		albums.push({
			id: album.id,
			name: album.albumName,
			count: assets,
			coverAssetId: cover,
			from,
			to
		});
	}
	return albums;
}
