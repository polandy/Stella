import { TranslatableError } from '../../../i18n/translatable';
import { phrase, type Phrase } from '../../../i18n/phrase';
import type { Remover, Visibility, Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import type { ActivityOf } from '../activity/activity';
import { removalAudit, type RemovableRecord } from '../activity/removal';
import { INTERACTION_KINDS, type InteractionKind } from '../../../story/interaction-kinds';
import { FULL_DATE_SHAPE, isRealCalendarDay } from '../../../dates/calendar';

/*
 * Interaction use-cases (docs/02 §2.6). An interaction is a touchpoint with a person — a
 * call, a visit, a gift — logged against one *subject* contact, optionally with other
 * contacts who were there. It is a child record of the subject: visibility follows the
 * central rule (private ⇒ only the author), enforced by the adapter's scoped reads. The
 * timeline it feeds is what "last contacted" is derived from; there is no separate column
 * to keep in sync.
 */

/** The kinds a touchpoint can have; shared with the UI (see `$lib/story/interaction-kinds`). */
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

/** The (happenedAt, createdAt) of the last interaction a client has seen. */
export interface InteractionCursor {
	happenedAt: string;
	createdAt: number;
}

/** Port the domain owns; the Drizzle adapter implements it with visibility-scoped reads. */
export interface InteractionRepository {
	insert(interaction: NewInteraction): Promise<void>;
	/** Interactions on a contact the viewer may see, most recent day first. */
	listForContactVisibleTo(viewer: Viewer, contactId: string): Promise<Interaction[]>;
	/**
	 * One keyset page of visible interactions, most recent day first. `before` excludes
	 * everything at or after that (happenedAt, createdAt) point, so passing the previous page's
	 * last row walks backwards through time without gaps or repeats. Same contract as the
	 * journal's page read, because the story timeline merges the two (docs/02 §2.23).
	 */
	listPageForContactVisibleTo(
		viewer: Viewer,
		contactId: string,
		opts: { limit: number; before?: InteractionCursor }
	): Promise<Interaction[]>;
	/** The latest day among the interactions on a contact the viewer may see, or null. */
	lastHappenedOnVisibleTo(viewer: Viewer, contactId: string): Promise<string | null>;
	/**
	 * The author's own interaction they still see (`authoredEditableBy`), with the participants
	 * they can see — archived ones included — or null.
	 */
	findOwn(
		author: Viewer,
		id: string
	): Promise<{ id: string; contactId: string; participantIds: string[] } | null>;
	/**
	 * Rewrite the author's own interaction — checked again here — and, in the same transaction,
	 * set the participants they can see to `participantIds`; one hidden from them stays. Whether
	 * it did.
	 */
	updateOwn(author: Viewer, edit: InteractionEdit): Promise<boolean>;
	/** The interaction, when the remover may remove it (`authoredRemovableBy`); else null. */
	findRemovableBy(remover: Remover, id: string): Promise<RemovableRecord | null>;
	/**
	 * Delete the interaction when the remover may — checked again here, at the moment of
	 * removal — and write `audit` in the same transaction if one went. Whether it did.
	 */
	deleteRemovableBy(
		remover: Remover,
		id: string,
		audit: ActivityOf<'record.removed'> | null
	): Promise<boolean>;
}

/** What an edit rewrites: everything but who wrote it, when, and who sees it. */
export interface InteractionEdit {
	id: string;
	kind: InteractionKind;
	happenedAt: string;
	title: string | null;
	description: string | null;
	/** The participants the author chose, never the subject itself. */
	participantIds: string[];
	updatedAt: number;
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
export class InvalidInteractionError extends TranslatableError {
	constructor(message: Phrase) {
		super(message, 'InvalidInteractionError');
	}
}

export const orNull = (value?: string | null): string | null => {
	const trimmed = (value ?? '').trim();
	return trimmed.length > 0 ? trimmed : null;
};

/**
 * The checks a touchpoint passes whether logged or edited: a known kind, a real day, and the
 * subject not among its own participants — who are named once each.
 */
export function checkedInteraction(input: {
	contactId: string;
	kind: InteractionKind;
	happenedAt: string;
	participantIds?: string[];
}): { happenedAt: string; participantIds: string[] } {
	if (!INTERACTION_KINDS.includes(input.kind)) {
		throw new InvalidInteractionError(
			phrase('errors.interaction.unknownKind', { kind: input.kind })
		);
	}
	const happenedAt = input.happenedAt.trim();
	if (!FULL_DATE_SHAPE.test(happenedAt)) {
		throw new InvalidInteractionError(phrase('errors.interaction.dayFormat'));
	}
	if (!isRealCalendarDay(happenedAt)) {
		throw new InvalidInteractionError(phrase('errors.interaction.noSuchDay', { day: happenedAt }));
	}
	const participantIds = [...new Set(input.participantIds ?? [])];
	if (participantIds.includes(input.contactId)) {
		throw new InvalidInteractionError(phrase('errors.interaction.selfParticipant'));
	}
	return { happenedAt, participantIds };
}

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
	const { happenedAt, participantIds } = checkedInteraction(input);
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

/**
 * Remove a touchpoint — its author's always, an admin's when it is shared (docs/03 §3.7). A
 * removal by someone other than the author is told to the household in the delete's own
 * transaction. Whether it went; one that is gone and one the remover may not touch answer alike.
 */
export async function removeInteraction(
	deps: Pick<InteractionDeps, 'interactions' | 'ids' | 'clock'>,
	remover: Remover,
	id: string
): Promise<boolean> {
	const found = await deps.interactions.findRemovableBy(remover, id);
	if (!found) return false;
	const audit = removalAudit(deps, remover, 'interaction', found);
	return deps.interactions.deleteRemovableBy(remover, id, audit);
}

/**
 * The day of the most recent interaction the viewer may see, or null — so "last contacted"
 * never leaks a private touchpoint through the profile header. Asked of the store as one day
 * rather than worked out from the whole list, which the person page no longer reads.
 */
export async function lastContactedOn(
	deps: Pick<InteractionDeps, 'interactions'>,
	viewer: Viewer,
	contactId: string
): Promise<string | null> {
	return deps.interactions.lastHappenedOnVisibleTo(viewer, contactId);
}
