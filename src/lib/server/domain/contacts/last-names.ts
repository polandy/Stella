import { TranslatableError } from '../../../errors/translatable';
import { phrase } from '../../../i18n/phrase';
import {
	buildSurnameView,
	foldSurname,
	proposeSurname,
	type FamilyCircle,
	type SurnameDismissal,
	type SurnamePerson
} from '../../../suggestions/rules/surnames';
import { groupBySurname, householdSpellings, type SurnameList } from '../../../suggestions/surname-groups';
import type { Viewer } from '../../access/visibility';
import type { IdGenerator } from '../../id';
import type { KinshipGraphSource } from '../relationships/suggestion-review';
import type { PassOnMap } from '../../../surnames/pass-on';
import type { SurnameProposal } from '../../../suggestions/rules/surnames';
import { withNameParts } from './display-name';
import type { NameDeps, NameWrite } from './name-parts';

/*
 * Last names for several people at once (docs/concepts/surnames.md §3, §5, §7). One write
 * behind every bulk path — the *Last names* list, *Select* on People and on a circle, passing a
 * name on — and the household's *not this name*. Nothing is written without a tap, and nothing
 * already there is overwritten unless that person was ticked by hand.
 */

/** A person as the *Last names* list shows them, and as the rules read them. */
export interface SurnameListPerson extends SurnamePerson {
	avatarPhotoId: string | null;
	isDeceased: boolean;
	/** Archived people are sources (a grandmother's name) but are not listed. */
	archived: boolean;
}

/** What the rules read beyond the kinship graph, scoped to one viewer (docs/03 §3.7). */
export interface SurnameFactsSource {
	loadSurnameFactsVisibleTo(viewer: Viewer): Promise<{
		people: SurnameListPerson[];
		familyCircles: FamilyCircle[];
	}>;
}

/** A declined name on its way to storage (`suggestion_dismissal`, relation `last_name`). */
export interface NewSurnameDismissal extends SurnameDismissal {
	id: string;
	householdId: string;
	dismissedBy: string;
	dismissedAt: number;
}

/** The household's *not this name* answers (docs/03 §3.9). */
export interface SurnameDismissalRepository {
	listForHousehold(viewer: Viewer): Promise<SurnameDismissal[]>;
	/** A second *no* is the same *no*: one answer, one row. */
	dismiss(entry: NewSurnameDismissal): Promise<void>;
	/** False when there was nothing to take back. */
	restore(viewer: Viewer, contactId: string, folded: string): Promise<boolean>;
}

export interface SurnameReviewDeps {
	surnames: SurnameFactsSource;
	relationships: KinshipGraphSource;
	surnameDismissals: Pick<SurnameDismissalRepository, 'listForHousehold'>;
}

export interface LastNameDeps extends NameDeps {
	ids: IdGenerator;
}

export interface SurnameDismissalDeps extends Pick<NameDeps, 'names' | 'clock'> {
	surnameDismissals: SurnameDismissalRepository;
	ids: IdGenerator;
}

/** One person's new last name; `replace` is set only when ticked by hand over an existing one. */
export interface LastNameChange {
	contactId: string;
	lastName: string;
	replace: boolean;
}

/** How the log line reads, in the actor's language — the edge words it, as for imports. */
export type LastNamesWording = (lastName: string, count: number) => string;

export class EmptyLastNameError extends TranslatableError {
	constructor() {
		super(phrase('errors.contact.emptyLastName'), 'EmptyLastNameError');
	}
}

/**
 * Thrown when a change would replace a last name nobody ticked to replace — a screen gone stale
 * since it was drawn, so the household's earlier answer is never silently overwritten (§5).
 */
export class LastNameWouldOverwriteError extends TranslatableError {
	constructor(name: string) {
		super(phrase('errors.contact.lastNameWouldOverwrite', { name }), 'LastNameWouldOverwriteError');
	}
}

/**
 * Write the changes in one transaction with one log entry (§7). Returns how many people were
 * given a name — those who already carried it are left alone and not counted — or null when one
 * of them is not visible to the viewer, in which case nothing at all is written.
 */
export async function setLastNames(
	deps: LastNameDeps,
	viewer: Viewer,
	changes: readonly LastNameChange[],
	wording: LastNamesWording
): Promise<number | null> {
	const wanted = changes.map((change) => ({ ...change, lastName: change.lastName.trim() }));
	if (wanted.some((change) => change.lastName === '')) throw new EmptyLastNameError();

	const found = await Promise.all(wanted.map((change) => deps.names.findByIdVisibleTo(viewer, change.contactId)));
	if (found.some((contact) => contact === null)) return null;

	const now = deps.clock.now();
	const writes: NameWrite[] = [];
	let anyPrivate = false;
	wanted.forEach((change, index) => {
		const contact = found[index]!;
		const current = (contact.lastName ?? '').trim();
		if (current && foldSurname(current) === foldSurname(change.lastName) && !change.replace) return;
		if (current && !change.replace) throw new LastNameWouldOverwriteError(contact.displayName);
		// Bulk paths never touch the former name: only the profile offers to keep one (§6).
		writes.push({
			id: contact.id,
			...withNameParts(contact, { lastName: change.lastName }),
			formerName: contact.formerName,
			updatedAt: now
		});
		anyPrivate ||= contact.visibility === 'private';
	});
	if (writes.length === 0) return 0;

	const names = [...new Set(writes.map((w) => w.lastName!))];
	await deps.names.writeNames(writes, {
		id: deps.ids.next(),
		householdId: viewer.householdId,
		actorId: viewer.id,
		action: 'update',
		entityType: 'last_name',
		entityId: writes[0]!.id,
		contactId: null,
		// The line is no more visible than the least visible person it is about.
		visibility: anyPrivate ? 'private' : 'shared',
		summary: wording(names.join(', '), writes.length),
		createdAt: now
	});
	return writes.length;
}

/** The *Last names* list for one viewer (§3.1). */
export interface LastNamesReview {
	list: SurnameList;
	/** The people the list names, by id. */
	people: Record<string, SurnameListPerson>;
	/** Every last name the viewer can see, in the household's spelling, for autocomplete. */
	knownSurnames: string[];
	/** The names the household said no to, so a *no* can be taken back. */
	declined: { contactId: string; personName: string; name: string }[];
}

/** Everyone the viewer may see without a last name, with what Stella proposes for each. */
export async function reviewLastNames(deps: SurnameReviewDeps, viewer: Viewer): Promise<LastNamesReview> {
	const [facts, graph, dismissed] = await Promise.all([
		deps.surnames.loadSurnameFactsVisibleTo(viewer),
		deps.relationships.loadKinshipGraphVisibleTo(viewer),
		deps.surnameDismissals.listForHousehold(viewer)
	]);
	const view = buildSurnameView({ people: facts.people, graph, familyCircles: facts.familyCircles, dismissed });
	const listed = facts.people
		.filter((p) => !p.archived && !(p.lastName ?? '').trim())
		.sort((a, b) => a.displayName.localeCompare(b.displayName));
	const spellings = householdSpellings(facts.people.map((p) => p.lastName));
	const byId = new Map(facts.people.map((p) => [p.id, p]));
	return {
		list: groupBySurname(
			listed.map((p) => ({ personId: p.id, proposal: proposeSurname(view, p.id) })),
			spellings
		),
		people: Object.fromEntries(listed.map((p) => [p.id, p])),
		knownSurnames: [...spellings.values()].sort((a, b) => a.localeCompare(b)),
		declined: dismissed
			.filter((d) => byId.has(d.contactId))
			.map((d) => ({
				contactId: d.contactId,
				personName: byId.get(d.contactId)!.displayName,
				name: spellings.get(d.folded) ?? d.folded
			}))
	};
}

/** What a page needs to help with last names after a save, and on one person's profile. */
export interface SurnameHelp {
	/** For everyone the viewer may see: their children and siblings still without a last name (§3.3). */
	passOn: PassOnMap;
	/** What Stella proposes for `subjectId`, for the profile's chip (§3.4); none without a subject. */
	proposal: SurnameProposal;
}

/**
 * Read once per page: whom a saved name can be passed on to, and what Stella proposes for the
 * person the page is about. Archived people are not offered a name, as they are not listed.
 */
export async function readSurnameHelp(
	deps: SurnameReviewDeps,
	viewer: Viewer,
	subjectId: string | null
): Promise<SurnameHelp> {
	const [facts, graph, dismissed] = await Promise.all([
		deps.surnames.loadSurnameFactsVisibleTo(viewer),
		deps.relationships.loadKinshipGraphVisibleTo(viewer),
		deps.surnameDismissals.listForHousehold(viewer)
	]);
	const view = buildSurnameView({ people: facts.people, graph, familyCircles: facts.familyCircles, dismissed });
	const nameless = new Map(
		facts.people.filter((p) => !p.archived && !(p.lastName ?? '').trim()).map((p) => [p.id, p])
	);
	const declined = new Map<string, string[]>();
	for (const d of dismissed) declined.set(d.contactId, [...(declined.get(d.contactId) ?? []), d.folded]);

	const passOn: Record<string, PassOnMap[string]> = {};
	for (const person of facts.people) {
		// One generation: children and siblings, never grandchildren in the same offer.
		const kin = [...new Set([...view.childrenOf(person.id), ...view.siblingsOf(person.id)])]
			.map((id) => nameless.get(id))
			.filter((p) => p !== undefined)
			.map((p) => ({ id: p.id, name: p.displayName, declined: declined.get(p.id) ?? [] }));
		if (kin.length > 0) passOn[person.id] = kin;
	}
	return { passOn, proposal: subjectId ? proposeSurname(view, subjectId) : { kind: 'none' } };
}

/** What the Settings card says: how many have no last name, and for how many Stella has one. */
export async function countLastNames(
	deps: SurnameReviewDeps,
	viewer: Viewer
): Promise<{ missing: number; suggested: number }> {
	const { list } = await reviewLastNames(deps, viewer);
	const suggested = list.groups.reduce((sum, group) => sum + group.rows.length, 0) + list.chooseOne.length;
	return { missing: suggested + list.none.length, suggested };
}

/**
 * *Not this name* (§5): the household's answer for this person and this name, folded, so it
 * holds for every member and a different name can still be proposed later. False when the
 * person is not visible to the viewer.
 */
export async function dismissLastName(
	deps: SurnameDismissalDeps,
	viewer: Viewer,
	contactId: string,
	name: string
): Promise<boolean> {
	if ((await deps.names.findByIdVisibleTo(viewer, contactId)) === null) return false;
	await deps.surnameDismissals.dismiss({
		id: deps.ids.next(),
		householdId: viewer.householdId,
		contactId,
		folded: foldSurname(name),
		dismissedBy: viewer.id,
		dismissedAt: deps.clock.now()
	});
	return true;
}

/** Take a *no* back, so the name is proposed again. */
export async function restoreLastName(
	deps: Pick<SurnameDismissalDeps, 'surnameDismissals'>,
	viewer: Viewer,
	contactId: string,
	name: string
): Promise<boolean> {
	return deps.surnameDismissals.restore(viewer, contactId, foldSurname(name));
}
