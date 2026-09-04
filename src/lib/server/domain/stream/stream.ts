import type { Visibility, Viewer } from '../../access/visibility';
import type { InteractionKind } from '../../../interactions/kinds';

/*
 * Household stream (docs/02 §2.22.2): what the family did, newest first. It is a *query* over
 * the existing tables — moments (journal entries), new people, new relationships and logged
 * interactions (docs/02 §2.6) — merged
 * here; there is no event table and nothing is logged twice. The adapter owns the
 * visibility-scoped reads; this module only merges, orders and limits, so it stays pure.
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
}

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

export type StreamItem =
	| ({ kind: 'moment'; mine: boolean } & MomentRow)
	| ({ kind: 'person'; mine: boolean } & PersonRow)
	| ({ kind: 'relationship'; mine: boolean } & RelationshipRow)
	| ({ kind: 'interaction'; mine: boolean } & InteractionRow);

export interface StreamRepository {
	recentMoments(viewer: Viewer, limit: number): Promise<MomentRow[]>;
	recentPeople(viewer: Viewer, limit: number): Promise<PersonRow[]>;
	recentRelationships(viewer: Viewer, limit: number): Promise<RelationshipRow[]>;
	recentInteractions(viewer: Viewer, limit: number): Promise<InteractionRow[]>;
}

export interface StreamDeps {
	stream: StreamRepository;
}

/**
 * Merge the four (already scoped, newest-first) sources into one stream, newest first, cut
 * to `limit`. Ties on time keep a stable kind order so a person created together with their
 * first moment reads "added … / wrote …" consistently. Pure and deterministic.
 */
export function assembleStream(
	sources: {
		moments: MomentRow[];
		people: PersonRow[];
		relationships: RelationshipRow[];
		interactions: InteractionRow[];
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
		)
	];
	const rank: Record<StreamItem['kind'], number> = {
		moment: 0,
		interaction: 1,
		relationship: 2,
		person: 3
	};
	items.sort((a, b) => b.at - a.at || rank[a.kind] - rank[b.kind] || a.id.localeCompare(b.id));
	return items.slice(0, Math.max(0, limit));
}

/** Fetch the scoped sources and build the viewer's stream. */
export async function buildStream(
	deps: StreamDeps,
	viewer: Viewer,
	limit = STREAM_LIMIT
): Promise<StreamItem[]> {
	const [moments, people, relationships, interactions] = await Promise.all([
		deps.stream.recentMoments(viewer, limit),
		deps.stream.recentPeople(viewer, limit),
		deps.stream.recentRelationships(viewer, limit),
		deps.stream.recentInteractions(viewer, limit)
	]);
	return assembleStream({ moments, people, relationships, interactions }, viewer.id, limit);
}
