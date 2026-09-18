import type { Visibility, Viewer } from '../../access/visibility';
import type { InteractionKind } from '../../../interactions/kinds';
import { NO_FILTER, STREAM_KINDS, type StreamFilter, type StreamKind } from '../../../stream/filter';

/*
 * Household stream (docs/02 §2.22.2): what the family did, newest first. It is a *query* over
 * the existing tables — moments (journal entries), new people, new relationships and logged
 * interactions (docs/02 §2.6) — merged here; nothing is logged twice.
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
	/** Precomputed when it happened — the record it names no longer exists. */
	summary: string;
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
	| ({ kind: 'notice'; mine: boolean } & NoticeRow);

export interface StreamRepository {
	recentMoments(viewer: Viewer, query: StreamQuery): Promise<MomentRow[]>;
	recentPeople(viewer: Viewer, query: StreamQuery): Promise<PersonRow[]>;
	recentRelationships(viewer: Viewer, query: StreamQuery): Promise<RelationshipRow[]>;
	recentInteractions(viewer: Viewer, query: StreamQuery): Promise<InteractionRow[]>;
	/** The one source that is the log itself, for what no table can report. */
	recentNotices(viewer: Viewer, query: StreamQuery): Promise<NoticeRow[]>;
}

export interface StreamDeps {
	stream: StreamRepository;
}

/**
 * Merge the five (already scoped, newest-first) sources into one stream, newest first, cut
 * to `limit`. Ties on time keep a stable kind order so a person created together with their
 * first moment reads "added … / wrote …" consistently. Pure and deterministic.
 */
export function assembleStream(
	sources: {
		moments: MomentRow[];
		people: PersonRow[];
		relationships: RelationshipRow[];
		interactions: InteractionRow[];
		notices: NoticeRow[];
	},
	viewerId: string,
	limit = STREAM_LIMIT
): StreamItem[] {
	const mine = (actor: StreamActor) => actor.id === viewerId;
	const items: StreamItem[] = [
		...sources.moments.map((m): StreamItem => ({ kind: 'moment', mine: mine(m.actor), ...m })),
		...sources.people.map((p): StreamItem => ({ kind: 'person', mine: mine(p.actor), ...p })),
		...sources.relationships.map(
			(r): StreamItem => ({ kind: 'relationship', mine: mine(r.actor), ...r })
		),
		...sources.interactions.map(
			(i): StreamItem => ({ kind: 'interaction', mine: mine(i.actor), ...i })
		),
		...sources.notices.map((r): StreamItem => ({ kind: 'notice', mine: mine(r.actor), ...r }))
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
	const [moments, people, relationships, interactions, notices] = await Promise.all([
		read('moment', () => stream.recentMoments(viewer, query)),
		read('person', () => stream.recentPeople(viewer, query)),
		read('relationship', () => stream.recentRelationships(viewer, query)),
		read('interaction', () => stream.recentInteractions(viewer, query)),
		read('notice', () => stream.recentNotices(viewer, query))
	]);
	return assembleStream(
		{ moments, people, relationships, interactions, notices },
		viewer.id,
		limit
	);
}
