import { otherEndRole, type RoleTerm } from '../relationships/roles';
import { FORMER_RELATIONSHIP_STATUS } from '../relationships/status';

/*
 * Photos of two people together, from Immich (docs/concepts/immich.md §4.3, docs/02 §2.24.8):
 * *You and Julia* on the strip when the viewer's own person is linked too, and *Together* on a
 * relationship row for a couple or a parent and child. Pure, so which pairs are offered and
 * which view the strip shows are decided and tested without a page.
 *
 * What is offered is the page's choice. The server lists the photos of any two people the viewer
 * sees and who are both linked (`domain/immich/glimpse.ts`): it reveals nothing either strip
 * would not.
 */

/** The ties a *Together* chip sits on: a couple, or a parent and a child, from either end. */
const TOGETHER_ROLES: ReadonlySet<RoleTerm> = new Set<RoleTerm>(['spouse', 'partner', 'parent', 'child']);

/** A row of the People card, as far as *Together* needs it. */
interface TogetherTie {
	otherContactId: string;
	typeKey: string;
	side?: 'forward' | 'reverse';
	status?: string | null;
}

/**
 * Whether a relationship row offers *Together*. Not for a couple that has ended: their photos
 * together are no one's to put forward on a chip.
 */
export function offersTogether(tie: TogetherTie): boolean {
	if (tie.status === FORMER_RELATIONSHIP_STATUS) return false;
	const role = otherEndRole(tie);
	return role !== null && TOGETHER_ROLES.has(role);
}

/**
 * Whom the page asks the server about — the viewer's own person first, then the couple and the
 * parents and children — each once, and never the page's own person.
 */
export function togetherCandidates(input: {
	pageContactId: string;
	selfContactId: string | null;
	ties: readonly TogetherTie[];
}): string[] {
	const ids = [
		...(input.selfContactId === null ? [] : [input.selfContactId]),
		...input.ties.filter(offersTogether).map((tie) => tie.otherContactId)
	];
	return [...new Set(ids)].filter((id) => id !== input.pageContactId);
}

/** What the strip can show: the person's own photos, or those of them with someone. */
export type StripView =
	| { kind: 'own' }
	/** *You and Julia*: with the viewer's own person. */
	| { kind: 'withYou'; contactId: string }
	/** *Julia and Bert*: with someone a relationship row asked for. */
	| { kind: 'withOther'; contactId: string };

/**
 * The strip's views, in the order its chips show them. *You and Julia* whenever the viewer's
 * own person is linked; another pair only once a row's *Together* asked for it — and then for as
 * long as the page is open, so its chip does not vanish when another is picked — so the strip
 * does not grow a chip per relative. A row naming the viewer asks for *You and Julia*.
 */
export function stripViews(input: {
	pageContactId: string;
	selfContactId: string | null;
	/** The people the server found linked, and seen, among `togetherCandidates`. */
	togetherWith: readonly string[];
	/** The pair the last *Together* tapped on a relationship row asked for, if any. */
	askedByRow: string | null;
}): StripView[] {
	const offered = (id: string | null): id is string =>
		id !== null && id !== input.pageContactId && input.togetherWith.includes(id);
	const views: StripView[] = [{ kind: 'own' }];
	if (offered(input.selfContactId)) views.push({ kind: 'withYou', contactId: input.selfContactId });
	if (offered(input.askedByRow) && input.askedByRow !== input.selfContactId) {
		views.push({ kind: 'withOther', contactId: input.askedByRow });
	}
	return views;
}

/** The view the strip shows for a choice: that pair when it is offered, else their own photos. */
export function viewShown(views: readonly StripView[], chosen: string | null): StripView {
	return views.find((view) => view.kind !== 'own' && view.contactId === chosen) ?? { kind: 'own' };
}
