import type { LinkedPhrase } from '$lib/i18n/linked';
import type { KinshipGraph } from '$lib/kinship/kinship';
import { childOf, inCircle, parentOf, partnerOf, shownAs, siblingOf } from '../surname-reasons';
import type { Confidence } from '../types';
import { buildView } from '../view';

/*
 * Where a last name can come from (docs/02 §2.2.4.1). Each rule reads only what
 * one viewer may see and yields a name, a confidence and a reason; `proposeSurname` combines
 * them for one person. The ids continue the F series of docs/02 §2.4.1
 * (*The suggestion rules*).
 *
 * Never a source: anything the viewer cannot see (the facts were scoped before they got here),
 * a description's free text, anyone's former name, a former partnership, a circle's *name*,
 * and email addresses.
 */

/** What a rule reads of a person. */
export interface SurnamePerson {
	id: string;
	displayName: string;
	firstName: string | null;
	lastName: string | null;
	nickname: string | null;
	formerName: string | null;
}

/** A circle of the *family* kind, with the members the viewer may see. */
export interface FamilyCircle {
	id: string;
	name: string;
	memberIds: readonly string[];
}

/** A name the household said is not this person's (§5), folded. */
export interface SurnameDismissal {
	contactId: string;
	folded: string;
}

/** Everything one viewer may see that a proposal can be drawn from. */
export interface SurnameFacts {
	people: readonly SurnamePerson[];
	graph: KinshipGraph;
	familyCircles: readonly FamilyCircle[];
	dismissed: readonly SurnameDismissal[];
}

/** One proposed name with how sure Stella is and every reason that led to it. */
export interface SurnameOption {
	name: string;
	confidence: Confidence;
	reasons: readonly LinkedPhrase[];
}

/**
 * What Stella proposes for one person: one name (with lower-ranked others as alternatives),
 * a choice between names that are equally sure, or nothing.
 */
export type SurnameProposal =
	| ({ kind: 'one'; alternatives: readonly string[] } & SurnameOption)
	| { kind: 'choose'; options: readonly SurnameOption[] }
	| { kind: 'none' };

/** The facts indexed once, so each rule asks rather than walks. */
export interface SurnameView {
	person(id: string): SurnamePerson | undefined;
	parentsOf(id: string): ReadonlySet<string>;
	childrenOf(id: string): ReadonlySet<string>;
	siblingsOf(id: string): ReadonlySet<string>;
	/** Current partners only: nothing is read through a partnership marked as over. */
	partnersOf(id: string): readonly string[];
	familyCirclesOf(id: string): readonly FamilyCircle[];
	isDismissed(id: string, folded: string): boolean;
}

/**
 * A surname as compared: case, diacritics and stray spaces ignored, the §2.2.1 rule — so
 * *Müller* and *muller* are one name, while the spelling shown stays as typed.
 */
export function foldSurname(name: string): string {
	return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const clean = (value: string | null | undefined) => (value ?? '').trim();

export function buildSurnameView(facts: SurnameFacts): SurnameView {
	const people = new Map(facts.people.map((p) => [p.id, p]));
	const kin = buildView(facts.graph);
	const partners = new Map<string, string[]>();
	for (const { a, b, former } of facts.graph.partnerEdges) {
		if (former) continue;
		partners.set(a, [...(partners.get(a) ?? []), b]);
		partners.set(b, [...(partners.get(b) ?? []), a]);
	}
	const circles = new Map<string, FamilyCircle[]>();
	for (const circle of facts.familyCircles) {
		for (const id of circle.memberIds) circles.set(id, [...(circles.get(id) ?? []), circle]);
	}
	const dismissed = new Set(facts.dismissed.map((d) => `${d.contactId} ${d.folded}`));
	return {
		person: (id) => people.get(id),
		parentsOf: kin.parentsOf,
		childrenOf: kin.childrenOf,
		siblingsOf: kin.siblingsOf,
		partnersOf: (id) => partners.get(id) ?? [],
		familyCirclesOf: (id) => circles.get(id) ?? [],
		isDismissed: (id, folded) => dismissed.has(`${id} ${folded}`)
	};
}

/** One rule's finding, before findings for the same name are merged. */
interface Finding {
	name: string;
	confidence: Confidence;
	reason: LinkedPhrase;
}

const RANK: Record<Confidence, number> = { certain: 0, likely: 1, possible: 2 };

/** The people of `ids` who carry a last name, in a fixed order. */
function named(view: SurnameView, ids: Iterable<string>): SurnamePerson[] {
	return [...ids]
		.map((id) => view.person(id))
		.filter((p): p is SurnamePerson => p !== undefined && clean(p.lastName) !== '');
}

/** The one name all of `people` share, or null when they carry none or disagree. */
function sharedName(people: readonly SurnamePerson[]): string | null {
	const names = new Set(people.map((p) => foldSurname(p.lastName!)));
	return names.size === 1 ? clean(people[0]!.lastName) : null;
}

const ref = (p: SurnamePerson) => ({ id: p.id, name: p.displayName });

/** F1 — each parent with a last name (two different ones make F1b, a choice). */
function fromParents(view: SurnameView, id: string): Finding[] {
	return named(view, view.parentsOf(id)).map((parent) => ({
		name: clean(parent.lastName),
		confidence: 'likely',
		reason: childOf(ref(parent))
	}));
}

/** F2 — the name every named sibling carries. */
function fromSiblings(view: SurnameView, id: string): Finding[] {
	const siblings = named(view, view.siblingsOf(id));
	const name = sharedName(siblings);
	return name ? [{ name, confidence: 'likely', reason: siblingOf(ref(siblings[0]!)) }] : [];
}

/** F3 — a current partner's name: offered, never pre-ticked. */
function fromPartners(view: SurnameView, id: string): Finding[] {
	return named(view, view.partnersOf(id)).map((partner) => ({
		name: clean(partner.lastName),
		confidence: 'possible',
		reason: partnerOf(ref(partner), clean(partner.formerName) || null)
	}));
}

/** F9 — the words after the first name in the shown name, typical of an import. */
function fromShownName(view: SurnameView, id: string): Finding[] {
	const p = view.person(id)!;
	const shown = clean(p.displayName).replace(/\s+/g, ' ');
	if (shown === clean(p.nickname)) return [];
	const first = clean(p.firstName);
	let rest = '';
	if (first) {
		if (shown.startsWith(`${first} `)) rest = shown.slice(first.length + 1);
	} else {
		rest = shown.split(' ').slice(1).join(' ');
	}
	rest = rest.trim();
	return rest ? [{ name: rest, confidence: 'certain', reason: shownAs(shown) }] : [];
}

/** F10 — the name all named children share: possible, since a parent may have kept their own. */
function fromChildren(view: SurnameView, id: string): Finding[] {
	const children = named(view, view.childrenOf(id));
	const name = sharedName(children);
	return name ? [{ name, confidence: 'possible', reason: parentOf(ref(children[0]!)) }] : [];
}

/** F11 — a family circle whose named members all share one name. The circle's name is never read. */
function fromFamilyCircles(view: SurnameView, id: string): Finding[] {
	return view.familyCirclesOf(id).flatMap((circle) => {
		const name = sharedName(
			named(
				view,
				circle.memberIds.filter((m) => m !== id)
			)
		);
		return name ? [{ name, confidence: 'likely' as const, reason: inCircle(circle.name) }] : [];
	});
}

const RULES = [
	fromShownName,
	fromParents,
	fromSiblings,
	fromFamilyCircles,
	fromPartners,
	fromChildren
];

/**
 * What Stella proposes as `id`'s last name (§4). Findings for the same name (folded) merge, the
 * surest confidence winning and every reason kept; a name declined for this person is dropped
 * first. One name at the top is the proposal and the rest are alternatives; several names
 * equally sure at the top are a choice, and no winner is picked for them.
 */
export function proposeSurname(view: SurnameView, id: string): SurnameProposal {
	const person = view.person(id);
	if (!person || clean(person.lastName) !== '') return { kind: 'none' };

	const merged = new Map<
		string,
		{ name: string; confidence: Confidence; reasons: LinkedPhrase[] }
	>();
	for (const finding of RULES.flatMap((rule) => rule(view, id))) {
		const folded = foldSurname(finding.name);
		if (view.isDismissed(id, folded)) continue;
		const known = merged.get(folded);
		if (!known) {
			merged.set(folded, {
				name: finding.name,
				confidence: finding.confidence,
				reasons: [finding.reason]
			});
			continue;
		}
		known.reasons.push(finding.reason);
		if (RANK[finding.confidence] < RANK[known.confidence]) known.confidence = finding.confidence;
	}

	const options = [...merged.values()].sort((a, b) => RANK[a.confidence] - RANK[b.confidence]);
	if (options.length === 0) return { kind: 'none' };
	const top = options.filter((o) => o.confidence === options[0]!.confidence);
	if (top.length > 1) return { kind: 'choose', options: top };
	return {
		kind: 'one',
		...options[0]!,
		alternatives: options.slice(1).map((o) => o.name)
	};
}
