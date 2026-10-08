import type { NoticeContent } from '../../../stream/notices';
import type { Visibility, Viewer } from '../../access/visibility';
import type { InteractionKind } from '../../../story/interaction-kinds';
import {
	NO_FILTER,
	STREAM_KINDS,
	type StreamFilter,
	type StreamKind
} from '../../../stream/filter';

/*
 * Household stream (docs/02 §2.22.2): what the family did, newest first. It is a *query* over
 * the existing tables — moments (journal entries), new people, new relationships, logged
 * interactions (docs/02 §2.6) and photos added to circles (§2.4.2) — merged here; nothing is
 * logged twice.
 *
 * The viewer can narrow it by kind and by member (`StreamFilter`). Both narrow the *reads*, not
 * the merged result: cutting to the limit first and filtering after would leave one member's
 * items pushed out by everyone else's.
 *
 * The one exception is a **removal**, which no table can report once its row is gone; that
 * one comes from `activity_log` (docs/04 §4.9). The adapter owns the visibility-scoped reads;
 * this module only merges, orders and limits, so it stays pure.
 */

/** Default number of items Home shows. */
export const STREAM_LIMIT = 40;

export interface StreamActor {
	id: string;
	name: string;
}

export interface StreamPerson {
	id: string;
	name: string;
	avatarPhotoId: string | null;
}

export interface MomentRow {
	id: string;
	at: number;
	actor: StreamActor;
	anchor: StreamPerson;
	entryDate: string;
	visibility: Visibility;
	/** Markdown source with canonical mention tokens; rendered at the edge. */
	body: string;
	mentions: StreamPerson[];
	photoIds: string[];
}

export interface PersonRow {
	id: string;
	at: number;
	actor: StreamActor;
	person: StreamPerson;
	description: string | null;
	visibility: Visibility;
}

export interface RelationshipRow {
	id: string;
	at: number;
	actor: StreamActor;
	from: StreamPerson;
	to: StreamPerson;
	/** Reads "from is <label> of to" — the type's forward label. */
	label: string;
	/** The type's machine key, so a built-in label reads in the viewer's language. */
	typeKey: string;
}

/** A logged interaction as the stream shows it (docs/02 §2.6). */
export interface InteractionRow {
	id: string;
	at: number;
	actor: StreamActor;
	/** The person the interaction is about. */
	subject: StreamPerson;
	/** Named `interactionKind` so it cannot be confused with the stream item's own `kind`. */
	interactionKind: InteractionKind;
	happenedAt: string;
	title: string | null;
	visibility: Visibility;
	participants: StreamPerson[];
}

/**
 * Something only the activity log can report: a name that stopped existing — deleted outright
 * or merged into someone else (docs/02 §2.2) — or an archive of the household being taken
 * (§2.15). In every case the tables cannot say it, either because the row is gone or because
 * there never was one.
 */
export interface NoticeRow {
	id: string;
	at: number;
	actor: StreamActor;
	/**
	 * What the line says: the prose written when a record went (deleted, merged) or the archive
	 * was taken or brought in, or the facts of last names given or a name edited, which Home says
	 * in the reader's language (`noticeContentOf`).
	 */
	content: NoticeContent;
}

/** A circle a photo was added to, as the stream names it. */
export interface StreamCircle {
	id: string;
	name: string;
}

/** One photo added to a circle (docs/02 §2.4.2), as the source reads it. */
export interface CirclePhotoUploadRow {
	/** The photo's id — also what the stream shows of it. */
	id: string;
	at: number;
	actor: StreamActor;
	circle: StreamCircle;
	/** The role it was added with; null for the circle as a whole. */
	role: string | null;
	visibility: Visibility;
}

/** Photos one member added to one circle in one go, as the stream shows them. */
export interface CirclePhotoRow extends CirclePhotoUploadRow {
	/** Newest first; the item's own `id` and `at` are the first one's. */
	photoIds: string[];
}

/**
 * How far apart two photos may have arrived and still be one upload. Several files picked at
 * once arrive one request after the other, and a queued upload drains photo by photo, so the
 * gap covers a slow phone; a second visit to the same circle later the same day stays its own.
 */
export const CIRCLE_UPLOAD_GAP_MS = 10 * 60 * 1000;

/**
 * Fold photos (newest first) into uploads: a photo joins the one before it when the same
 * member added it to the same circle, with the same visibility, within `CIRCLE_UPLOAD_GAP_MS`.
 * Without it, a class trip's twenty photos would be twenty items and push everything else out.
 */
function groupCirclePhotos(photos: readonly CirclePhotoUploadRow[]): CirclePhotoRow[] {
	const uploads: CirclePhotoRow[] = [];
	let lastAt = 0;
	for (const photo of photos) {
		const open = uploads.at(-1);
		if (
			open &&
			open.actor.id === photo.actor.id &&
			open.circle.id === photo.circle.id &&
			open.visibility === photo.visibility &&
			lastAt - photo.at <= CIRCLE_UPLOAD_GAP_MS
		) {
			open.photoIds.push(photo.id);
			if (open.role !== photo.role) open.role = null;
		} else {
			uploads.push({ ...photo, photoIds: [photo.id] });
		}
		lastAt = photo.at;
	}
	return uploads;
}

/**
 * One read of one source: at most `limit` rows, newest first, and only what `memberId` did when
 * it is set. Visibility scoping is the adapter's either way — the member narrows, never widens.
 */
export interface StreamQuery {
	limit: number;
	memberId: string | null;
}

export type StreamItem =
	| ({ kind: 'moment'; mine: boolean } & MomentRow)
	| ({ kind: 'person'; mine: boolean } & PersonRow)
	| ({ kind: 'relationship'; mine: boolean } & RelationshipRow)
	| ({ kind: 'interaction'; mine: boolean } & InteractionRow)
	| ({ kind: 'notice'; mine: boolean } & NoticeRow)
	| ({ kind: 'circlePhoto'; mine: boolean } & CirclePhotoRow);

export interface StreamRepository {
	recentMoments(viewer: Viewer, query: StreamQuery): Promise<MomentRow[]>;
	recentPeople(viewer: Viewer, query: StreamQuery): Promise<PersonRow[]>;
	recentRelationships(viewer: Viewer, query: StreamQuery): Promise<RelationshipRow[]>;
	recentInteractions(viewer: Viewer, query: StreamQuery): Promise<InteractionRow[]>;
	/** The one source that is the log itself, for what no table can report. */
	recentNotices(viewer: Viewer, query: StreamQuery): Promise<NoticeRow[]>;
	/** Photos added to circles, newest first, one row per photo (docs/02 §2.4.2). */
	recentCirclePhotos(viewer: Viewer, query: StreamQuery): Promise<CirclePhotoUploadRow[]>;
}

export interface StreamDeps {
	stream: StreamRepository;
}

/**
 * Merge the six (already scoped, newest-first) sources into one stream, newest first, cut
 * to `limit`; a circle's photos are folded into uploads first. Ties on time keep a stable kind order so a person created together with their
 * first moment reads "added … / wrote …" consistently. Pure and deterministic.
 */
export function assembleStream(
	sources: {
		moments: MomentRow[];
		people: PersonRow[];
		relationships: RelationshipRow[];
		interactions: InteractionRow[];
		notices: NoticeRow[];
		circlePhotos: CirclePhotoUploadRow[];
	},
	viewerId: string,
	limit = STREAM_LIMIT
): StreamItem[] {
	const mine = (actor: StreamActor) => actor.id === viewerId;
	const items: StreamItem[] = [
		...sources.moments.map((m): StreamItem => ({ kind: 'moment', mine: mine(m.actor), ...m })),
		...sources.people.map((p): StreamItem => ({ kind: 'person', mine: mine(p.actor), ...p })),
		...sources.relationships.map((r): StreamItem => ({
			kind: 'relationship',
			mine: mine(r.actor),
			...r
		})),
		...sources.interactions.map((i): StreamItem => ({
			kind: 'interaction',
			mine: mine(i.actor),
			...i
		})),
		...sources.notices.map((r): StreamItem => ({ kind: 'notice', mine: mine(r.actor), ...r })),
		...groupCirclePhotos(sources.circlePhotos).map((c): StreamItem => ({
			kind: 'circlePhoto',
			mine: mine(c.actor),
			...c
		}))
	];
	const rank = (kind: StreamKind) => STREAM_KINDS.indexOf(kind);
	items.sort((a, b) => b.at - a.at || rank(a.kind) - rank(b.kind) || a.id.localeCompare(b.id));
	return items.slice(0, Math.max(0, limit));
}

/**
 * Fetch the scoped sources and build the viewer's stream, narrowed to `filter`. A source whose
 * kind the filter leaves out is not read at all.
 */
export async function buildStream(
	deps: StreamDeps,
	viewer: Viewer,
	filter: StreamFilter = NO_FILTER,
	limit = STREAM_LIMIT
): Promise<StreamItem[]> {
	const query: StreamQuery = { limit, memberId: filter.memberId };
	const read = <T>(kind: StreamKind, source: () => Promise<T[]>): Promise<T[]> =>
		filter.kind === null || filter.kind === kind ? source() : Promise.resolve([]);
	const { stream } = deps;
	const [moments, people, relationships, interactions, notices, circlePhotos] = await Promise.all([
		read('moment', () => stream.recentMoments(viewer, query)),
		read('person', () => stream.recentPeople(viewer, query)),
		read('relationship', () => stream.recentRelationships(viewer, query)),
		read('interaction', () => stream.recentInteractions(viewer, query)),
		read('notice', () => stream.recentNotices(viewer, query)),
		read('circlePhoto', () => stream.recentCirclePhotos(viewer, query))
	]);
	return assembleStream(
		{ moments, people, relationships, interactions, notices, circlePhotos },
		viewer.id,
		limit
	);
}
