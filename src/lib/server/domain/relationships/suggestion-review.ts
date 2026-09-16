import type { KinshipGraph } from '../../../kinship/kinship';
import { evaluate } from '../../../suggestions/engine';
import { pairKey, type Dismissal } from '../../../suggestions/claims';
import type { LinkSuggestion, Relation } from '../../../suggestions/types';
import { buildView } from '../../../suggestions/view';
import type { Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';

/*
 * The on-demand review and the dismissal log (docs/concepts/relationship-suggestions.md §6.4
 * and §6.5).
 *
 * Every other suggestion in Stella is a consequence of a write: something was stored, so the
 * page says what follows, and reloading loses it. That makes the whole rule set unreachable
 * for a household whose links were entered before the rules existed — the claim was raised in
 * an instant nobody was watching and never comes back. A review is the deliberate entry point:
 * a member asks what stands around one person, and the same rules answer against the graph as
 * it is now.
 *
 * A control that can be pressed as often as one likes needs somewhere to put a *no*, or it
 * re-offers a declined claim forever. Hence the log, and hence both living in one file: the
 * review is unusable without it.
 *
 * Seams, not rules. Each use-case asks the port for the graph *this viewer* may see, hands it
 * to the pure engine and writes nothing the household did not ask for.
 */

/** The one read a review needs: the primary links this viewer may see (docs/03 §3.7). */
export interface KinshipGraphSource {
	loadKinshipGraphVisibleTo(viewer: Viewer): Promise<KinshipGraph>;
}

/** A declined claim on its way to storage. */
export interface NewDismissal extends Dismissal {
	id: string;
	householdId: string;
	dismissedBy: string;
}

/** The household's log of declined claims (docs/03 §3.9). */
export interface SuggestionDismissalRepository {
	/** Every claim this viewer's household has declined. */
	listForHousehold(viewer: Viewer): Promise<Dismissal[]>;
	/** Records the *no*. A claim already declined stays as it was — one answer, one row. */
	dismiss(entry: NewDismissal): Promise<void>;
	/** Takes the *no* back; false when there was nothing to take back. */
	restore(viewer: Viewer, relation: Relation, pair: string): Promise<boolean>;
}

/**
 * What it takes to *ask* for suggestions: the graph, and the answers the household has already
 * given. Narrower than `SuggestionReviewDeps` on purpose — a read has no business holding a port it
 * could write a dismissal through.
 */
export interface SuggestionReviewSource {
	relationships: KinshipGraphSource;
	dismissals: Pick<SuggestionDismissalRepository, 'listForHousehold'>;
}

export interface SuggestionReviewDeps extends SuggestionReviewSource {
	dismissals: SuggestionDismissalRepository;
	ids: IdGenerator;
	clock: Clock;
}

/** A suggested link with the names the interface needs to phrase it. */
export interface ProposedLink extends LinkSuggestion {
	fromName: string;
	toName: string;
}

/** The claim a member is answering: this relation, over these two people. */
export interface SuggestedClaim {
	relation: Relation;
	fromId: string;
	toId: string;
}

/** Puts the two display names on a suggestion, which is all the edge is missing. */
export function nameProposals(
	suggestions: readonly LinkSuggestion[],
	nameOf: (id: string) => string
): ProposedLink[] {
	return suggestions.map((suggestion) => ({
		...suggestion,
		fromName: nameOf(suggestion.fromId),
		toName: nameOf(suggestion.toId)
	}));
}

/**
 * What stands around `subjectId` right now (§6.5) — asked for, not raised by a write. Nothing
 * is stored: each row is a question the household answers one at a time, and leaving one alone
 * stays free of consequence, or members would decline things merely to clear the list.
 */
export async function reviewPerson(
	deps: SuggestionReviewSource,
	viewer: Viewer,
	subjectId: string,
	options: { includeDismissed?: boolean } = {}
): Promise<ProposedLink[]> {
	const [graph, dismissals] = await Promise.all([
		deps.relationships.loadKinshipGraphVisibleTo(viewer),
		deps.dismissals.listForHousehold(viewer)
	]);
	const view = buildView(graph, dismissals);
	if (!view.has(subjectId)) return [];
	const found = evaluate({ kind: 'person-reviewed', subjectId }, view, options);
	return nameProposals(found, view.nameOf);
}

/**
 * What stands across the whole household right now (§6.6) — the same question `reviewPerson`
 * asks, about everyone the viewer may see.
 *
 * It exists because a per-person review only ever reaches the people somebody thought to open,
 * and a household that entered or imported its links years ago has opened none of them. One
 * graph read and one evaluation answer for every family at once; the engine's
 * `oneRowPerClaim` is what keeps a claim reached from both ends of a sibling group a single
 * question.
 */
export async function reviewHousehold(
	deps: SuggestionReviewSource,
	viewer: Viewer,
	options: { includeDismissed?: boolean } = {}
): Promise<ProposedLink[]> {
	const [graph, dismissals] = await Promise.all([
		deps.relationships.loadKinshipGraphVisibleTo(viewer),
		deps.dismissals.listForHousehold(viewer)
	]);
	const view = buildView(graph, dismissals);
	return nameProposals(evaluate({ kind: 'household-reviewed' }, view, options), view.nameOf);
}

/**
 * Decline a claim, so it stops being offered however a rule reaches it later (§6.4).
 *
 * Both people are checked against the graph this viewer may see: a hand-written form can only
 * ever answer a claim about people the viewer can already name. False means exactly that —
 * nothing was written.
 */
export async function dismissSuggestion(
	deps: SuggestionReviewDeps,
	viewer: Viewer,
	claim: SuggestedClaim
): Promise<boolean> {
	const view = buildView(await deps.relationships.loadKinshipGraphVisibleTo(viewer));
	if (!view.has(claim.fromId) || !view.has(claim.toId)) return false;

	await deps.dismissals.dismiss({
		id: deps.ids.next(),
		householdId: viewer.householdId,
		relation: claim.relation,
		pairKey: pairKey(claim.fromId, claim.toId),
		dismissedBy: viewer.id,
		dismissedAt: deps.clock.now()
	});
	return true;
}

/**
 * Take a *no* back, so the claim is offered again on the next review (§6.5). A dismissal is
 * never a silent permanent veto — that is the whole reason *show dismissed* exists.
 */
export async function restoreSuggestion(
	deps: Pick<SuggestionReviewDeps, 'dismissals'>,
	viewer: Viewer,
	claim: SuggestedClaim
): Promise<boolean> {
	return deps.dismissals.restore(viewer, claim.relation, pairKey(claim.fromId, claim.toId));
}
