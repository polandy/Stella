import type { RelationshipAddManyPayload } from '../../../commands/commands';
import { TranslatableError } from '../../../errors/translatable';
import { phrase, type Phrase } from '../../../i18n/phrase';
import { addRelationshipChecked, type AddCheckedDeps } from './add-checked';
import type { RelationshipRepository } from './relationships';
import { stageRelationships } from './staged-relationships';

/*
 * Linking several people in one go (docs/02 §2.4, ADR-118): one type, one status, one
 * description, a since day per pair. Each link passes
 * through `addRelationshipChecked` — the very checks a single link meets — against a staging
 * that already holds the links picked before it, so the batch is judged as a whole. Every
 * refused person is named with the reason; then nothing is written. Only when all pass are
 * the links stored, in one transaction.
 */

export type AddRelationshipsInput = RelationshipAddManyPayload;

export interface AddRelationshipsDeps extends AddCheckedDeps {
	relationships: AddCheckedDeps['relationships'] & Pick<RelationshipRepository, 'insertAll'>;
}

/** One picked person who cannot be linked this way, and why — for the form to mark. */
export interface RelationshipRefusal {
	targetId: string;
	/** As the author sees them; '' for someone they cannot see (any more). */
	targetName: string;
	reason: Phrase;
}

/** A stored link and the person it was picked for. */
export interface AddedRelationship {
	targetId: string;
	relationshipId: string;
}

export type AddRelationshipsResult =
	{ ok: true; links: AddedRelationship[] } | { ok: false; refusals: RelationshipRefusal[] };

/** A batch with nobody picked in it — there is no person to mark, so it is refused whole. */
export class NobodyPickedError extends TranslatableError {
	constructor() {
		super(phrase('errors.relationship.needPersonAndType'), 'NobodyPickedError');
	}
}

/** Store every link of the batch, or — when any person is refused — none, saying who and why. */
export async function addRelationships(
	deps: AddRelationshipsDeps,
	author: { userId: string; householdId: string },
	input: AddRelationshipsInput
): Promise<AddRelationshipsResult> {
	if (input.links.length === 0) throw new NobodyPickedError();

	const staging = stageRelationships(deps, deps.types);
	const stagedDeps: AddCheckedDeps = { ...deps, ...staging.deps };
	const viewer = { id: author.userId, householdId: author.householdId };

	const links: AddedRelationship[] = [];
	const refusals: RelationshipRefusal[] = [];
	// One after another, never in parallel: each link is judged against the ones staged before it.
	for (const { targetId, sinceDate } of input.links) {
		try {
			const { relationshipId } = await addRelationshipChecked(stagedDeps, author, {
				contactId: input.contactId,
				targetId,
				typeChoice: input.typeChoice,
				description: input.description,
				sinceDate,
				status: input.status
			});
			links.push({ targetId, relationshipId });
		} catch (err) {
			// A sentence for the member; anything else is ours and fails the whole batch loudly.
			if (!(err instanceof TranslatableError)) throw err;
			refusals.push({
				targetId,
				targetName: await staging.nameOf(viewer, targetId),
				reason: err.phrase
			});
		}
	}

	if (refusals.length > 0) return { ok: false, refusals };
	await deps.relationships.insertAll(staging.staged());
	return { ok: true, links };
}

/** A batch refused: one sentence naming each refused person, and the refusals themselves. */
export class RelationshipsRefusedError extends TranslatableError {
	constructor(readonly refusals: readonly RelationshipRefusal[]) {
		super(
			(t) =>
				refusals
					.map(({ targetName, reason }) =>
						targetName
							? t('errors.relationship.refusedFor', { name: targetName, reason: reason(t) })
							: reason(t)
					)
					.join(' '),
			'RelationshipsRefusedError'
		);
	}
}

/**
 * `addRelationships` as a command answers (`relationship.addMany`): the stored ids, or a
 * refusal the dispatcher hands back to the member — so a batch kept on a phone is never
 * retried for ever, and its *Could not send* names everyone who stood in the way.
 */
export async function addRelationshipsOrRefuse(
	deps: AddRelationshipsDeps,
	author: { userId: string; householdId: string },
	input: AddRelationshipsInput
): Promise<{ relationshipIds: string[] }> {
	const result = await addRelationships(deps, author, input);
	if (!result.ok) throw new RelationshipsRefusedError(result.refusals);
	return { relationshipIds: result.links.map((link) => link.relationshipId) };
}
