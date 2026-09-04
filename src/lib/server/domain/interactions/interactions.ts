import type { Visibility, Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import { INTERACTION_KINDS, type InteractionKind } from '../../../interactions/kinds';
import { FULL_DATE_SHAPE, isRealCalendarDay } from '../dates/calendar';

/*
 * Interaction use-cases (docs/02 §2.6). An interaction is a touchpoint with a person — a
 * call, a visit, a gift — logged against one *subject* contact, optionally with other
 * contacts who were there. It is a child record of the subject: visibility follows the
 * central rule (private ⇒ only the author), enforced by the adapter's scoped reads. The
 * timeline it feeds is what "last contacted" is derived from; there is no separate column
 * to keep in sync.
 */

/** The kinds a touchpoint can have; shared with the UI (see `$lib/interactions/kinds`). */
export { INTERACTION_KINDS, type InteractionKind };

/** The member logging an interaction, with the visibility their entries default to. */
export interface InteractionAuthor {
	userId: string;
	householdId: string;
	defaultVisibility: Visibility;
}

/** An interaction as handed to the repository for storage. */
export interface NewInteraction {
	id: string;
	contactId: string;
	createdBy: string;
	visibility: Visibility;
	kind: InteractionKind;
	/** The day it happened, ISO `YYYY-MM-DD` (distinct from createdAt). */
	happenedAt: string;
	title: string | null;
	description: string | null;
	/** Other contacts present, never the subject itself. */
	participantIds: string[];
	createdAt: number;
	updatedAt: number;
}

/** A participant as read back for display. */
export interface InteractionParticipant {
	contactId: string;
	displayName: string;
	avatarPhotoId: string | null;
}

/** An interaction as read back for the timeline. */
export interface Interaction extends Omit<NewInteraction, 'participantIds'> {
	participants: InteractionParticipant[];
}

/** Port the domain owns; the Drizzle adapter implements it with visibility-scoped reads. */
export interface InteractionRepository {
	insert(interaction: NewInteraction): Promise<void>;
	/** Interactions on a contact the viewer may see, most recent day first. */
	listForContactVisibleTo(viewer: Viewer, contactId: string): Promise<Interaction[]>;
	/** Delete an interaction the viewer authored; returns whether a row was removed. */
	deleteOwn(params: { authorId: string; id: string }): Promise<boolean>;
}

/** Collaborators the use-cases need, injected by the composition root. */
export interface InteractionDeps {
	interactions: InteractionRepository;
	ids: IdGenerator;
	clock: Clock;
}

/** What the form provides; everything optional is normalised to null or the default. */
export interface LogInteractionInput {
	contactId: string;
	kind: InteractionKind;
	happenedAt: string;
	title?: string | null;
	description?: string | null;
	participantIds?: string[];
	visibility?: Visibility;
}

/** Thrown when an interaction's kind, day or participants are not acceptable. */
export class InvalidInteractionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'InvalidInteractionError';
	}
}

const orNull = (value?: string | null): string | null => {
	const trimmed = (value ?? '').trim();
	return trimmed.length > 0 ? trimmed : null;
};

/**
 * Log an interaction with a contact. The caller must have verified the subject contact is
 * visible to the author; the adapter scopes participants the same way on read, so a
 * participant the author may not see simply never renders.
 */
export async function logInteraction(
	deps: InteractionDeps,
	author: InteractionAuthor,
	input: LogInteractionInput
): Promise<string> {
	if (!INTERACTION_KINDS.includes(input.kind)) {
		throw new InvalidInteractionError(`Unknown interaction kind: ${input.kind}`);
	}
	const happenedAt = input.happenedAt.trim();
	if (!FULL_DATE_SHAPE.test(happenedAt)) {
		throw new InvalidInteractionError('The day must be YYYY-MM-DD.');
	}
	if (!isRealCalendarDay(happenedAt)) {
		throw new InvalidInteractionError(`There is no such day in the calendar: ${happenedAt}.`);
	}
	const participantIds = [...new Set(input.participantIds ?? [])];
	if (participantIds.includes(input.contactId)) {
		throw new InvalidInteractionError('The person the interaction is about cannot also be a participant.');
	}

	const now = deps.clock.now();
	const id = deps.ids.next();
	await deps.interactions.insert({
		id,
		contactId: input.contactId,
		createdBy: author.userId,
		visibility: input.visibility ?? author.defaultVisibility,
		kind: input.kind,
		happenedAt,
		title: orNull(input.title),
		description: orNull(input.description),
		participantIds,
		createdAt: now,
		updatedAt: now
	});
	return id;
}

/** The interactions of a contact the viewer may see, most recent day first. */
export async function listInteractions(
	deps: Pick<InteractionDeps, 'interactions'>,
	viewer: Viewer,
	contactId: string
): Promise<Interaction[]> {
	return deps.interactions.listForContactVisibleTo(viewer, contactId);
}

/** Delete one of the author's own interactions; returns whether one was removed. */
export async function deleteInteraction(
	deps: Pick<InteractionDeps, 'interactions'>,
	author: InteractionAuthor,
	id: string
): Promise<boolean> {
	return deps.interactions.deleteOwn({ authorId: author.userId, id });
}

/**
 * The day of the most recent interaction, or null. Derived from the list the viewer may
 * see, so "last contacted" never leaks a private touchpoint through the profile header.
 */
export function lastContactedAt(
	interactions: readonly Pick<Interaction, 'happenedAt'>[]
): string | null {
	let latest: string | null = null;
	for (const { happenedAt } of interactions) {
		if (latest === null || happenedAt > latest) latest = happenedAt;
	}
	return latest;
}
