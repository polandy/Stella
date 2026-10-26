import { foldAddress } from '../../../people/same-address';
import {
	findSameAddresses,
	parseSameAddressKey,
	sameAddressKey,
	type HomeAtLine,
	type OwnLine,
	type SameAddressCheck,
	type SameAddressPerson
} from '../../../people/same-address-check';
import type { Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import { HomeGoneError, type HomeChange, type HomeRepository } from './homes';

/*
 * *Settings → Data quality → Same address* (docs/02 §2.17; docs/02 §2.2, *A shared home*):
 * people whose own address lines are one address become one home, or join the home that
 * already has the line — only on a tap, and only ever people the viewer may see, so a private
 * person changes by their owner alone (docs/03 §3.7). *Not the same* is the household's answer,
 * kept beside the relationship checks' (docs/03 §3.9).
 *
 * Every write runs the check again on fresh data and acts only on what it still finds, so a
 * screen gone stale can never move someone who no longer has the line.
 */

/** An own address line as the write needs it: what a new home is made from. */
export interface OwnLineFact extends OwnLine {
	label: string | null;
	meta: string | null;
}

/** What the check reads: everyone the viewer may browse, their own lines and their homes. */
export interface SameAddressFacts {
	people: SameAddressPerson[];
	ownLines: OwnLineFact[];
	homes: HomeAtLine[];
}

export interface SameAddressSource {
	loadVisibleTo(viewer: Viewer): Promise<SameAddressFacts>;
}

export interface NewSameAddressDismissal {
	id: string;
	householdId: string;
	key: string;
	dismissedBy: string;
	dismissedAt: number;
}

/** The household's *Not the same* answers, as `sameAddressKey` keys (docs/03 §3.9). */
export interface SameAddressDismissalRepository {
	listForHousehold(viewer: Viewer): Promise<string[]>;
	/** A second *no* is the same *no*. */
	dismiss(entry: NewSameAddressDismissal): Promise<void>;
	/** False when there was nothing to take back. */
	restore(viewer: Viewer, key: string): Promise<boolean>;
}

export interface SameAddressDeps {
	sameAddress: SameAddressSource;
	dismissals: SameAddressDismissalRepository;
	homes: Pick<HomeRepository, 'apply'>;
	ids: IdGenerator;
	clock: Clock;
}

/** A finding as the screen sent it back: its line, the people shown, the home offered. */
export interface FindingAnswer {
	folded: string;
	contactIds: readonly string[];
	/** The home to join, or null for a new one. */
	homeId: string | null;
}

export async function checkSameAddresses(
	deps: Pick<SameAddressDeps, 'sameAddress' | 'dismissals'>,
	viewer: Viewer
): Promise<SameAddressCheck> {
	const [facts, dismissals] = await Promise.all([
		deps.sameAddress.loadVisibleTo(viewer),
		deps.dismissals.listForHousehold(viewer)
	]);
	return findSameAddresses({ ...facts, dismissals });
}

/** The finding at this line as it stands now, declined or not, and its facts. */
async function standing(deps: SameAddressDeps, viewer: Viewer, folded: string) {
	const facts = await deps.sameAddress.loadVisibleTo(viewer);
	const finding = findSameAddresses({ ...facts, dismissals: [] }).open.find(
		(f) => f.folded === folded
	);
	return { facts, finding };
}

/**
 * *Make one home* — or *Join the home* when one has the line. The people shown who still have
 * the line lose it as an own address and live in the home; one transaction. Answers the home.
 */
export async function makeOneHome(
	deps: SameAddressDeps,
	viewer: Viewer,
	answer: FindingAnswer
): Promise<{ homeId: string; moved: number }> {
	const { facts, finding } = await standing(deps, viewer, answer.folded);
	if (!finding || (finding.home?.id ?? null) !== answer.homeId) throw new HomeGoneError();
	const asked = new Set(answer.contactIds);
	const moving = finding.people.filter((p) => asked.has(p.id));
	if (moving.length < (finding.home ? 1 : 2)) throw new HomeGoneError();

	const movingIds = new Set(moving.map((p) => p.id));
	const lines = facts.ownLines.filter(
		(l) => movingIds.has(l.contactId) && foldAddress(l.value) === answer.folded
	);
	const now = deps.clock.now();
	const change: HomeChange = {
		create: null,
		update: null,
		dropFields: lines.map((l) => ({ contactId: l.contactId, fieldId: l.fieldId })),
		addFields: [],
		join: [],
		leave: []
	};

	let homeId: string;
	let joining = moving;
	if (finding.home) {
		homeId = finding.home.id;
		const already = new Set(finding.home.livesHere.map((p) => p.id));
		joining = moving.filter((p) => !already.has(p.id));
	} else {
		// The first person's own spelling, label and parts become the home's.
		const from = lines.find((l) => l.contactId === moving[0]!.id)!;
		homeId = deps.ids.next();
		change.create = {
			id: homeId,
			householdId: viewer.householdId,
			label: from.label,
			value: from.value,
			meta: from.meta,
			createdBy: viewer.id,
			createdAt: now,
			updatedAt: now
		};
	}
	change.join = joining.map((p) => ({
		homeId,
		contactId: p.id,
		createdBy: viewer.id,
		createdAt: now
	}));
	await deps.homes.apply(change);
	return { homeId, moved: joining.length };
}

/** *Not the same*: remembered for these people at this line, so the check stops asking. */
export async function declineSameAddress(
	deps: SameAddressDeps,
	viewer: Viewer,
	answer: Pick<FindingAnswer, 'folded' | 'contactIds'>
): Promise<void> {
	const { finding } = await standing(deps, viewer, answer.folded);
	const asked = new Set(answer.contactIds);
	const ids = (finding?.people ?? []).filter((p) => asked.has(p.id)).map((p) => p.id);
	if (ids.length === 0) throw new HomeGoneError();
	await deps.dismissals.dismiss({
		id: deps.ids.next(),
		householdId: viewer.householdId,
		key: sameAddressKey(answer.folded, ids),
		dismissedBy: viewer.id,
		dismissedAt: deps.clock.now()
	});
}

/**
 * *Ask again*: takes a *Not the same* back. Only an answer that holds back a finding the viewer
 * can see now — the key names people, and nobody learns of one they may not see.
 */
export async function askAgainSameAddress(
	deps: SameAddressDeps,
	viewer: Viewer,
	key: string
): Promise<boolean> {
	if (!parseSameAddressKey(key)) return false;
	const check = await checkSameAddresses(deps, viewer);
	if (!check.declined.some((f) => f.dismissedAs === key)) return false;
	return deps.dismissals.restore(viewer, key);
}
