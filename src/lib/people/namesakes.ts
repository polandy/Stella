/*
 * Telling namesakes apart (docs/02 §2.2.3). A household ends up with several people called
 * just "Thomas" — met once, first name only — and a list of five identical names is no help
 * choosing one. Every person whose name another person on the list shares gets a second line
 * saying which one they are. Pure and client-safe: the pickers work it out as they render.
 */

import { hasMessage, type Translate } from '../i18n/translate';
import { relationshipRowLabel } from '../relationships/labels';
import type { ContextTie, PersonContext } from './context';

/** What a person needs to carry for their namesakes to be told apart. */
export interface Distinguishable {
	id: string;
	displayName: string;
	description?: string | null;
	metPlace?: string | null;
	metDate?: string | null;
	/** Only the clean-up list reads it; the second line never names a surname the name shows. */
	lastName?: string | null;
}

/** The second line under a namesake, wording left to the component (docs/02 §2.19). */
export type Distinction =
	| { kind: 'description'; text: string }
	/** At least one of the two is present. */
	| { kind: 'met'; place: string | null; year: string | null }
	/** Only when nothing was typed: a link the viewer may see, from the namesake's end. */
	| { kind: 'tie'; tie: ContextTie }
	/** Only when nothing was typed and no link says more: a circle they are in. */
	| { kind: 'circle'; name: string; role: string | null }
	| { kind: 'nothing' };

/** Names that look the same on screen count as the same; accents do not, they show. */
const sameNameKey = (displayName: string) => displayName.trim().toLowerCase();

const filled = (value: string | null | undefined) => value?.trim() || null;

/** The year a stored meeting date starts with, when it starts with one. */
const yearOf = (metDate: string | null | undefined) => /^\d{4}/.exec(metDate?.trim() ?? '')?.[0] ?? null;

function distinctionOf(person: Distinguishable): Distinction {
	const description = filled(person.description);
	if (description) return { kind: 'description', text: description };
	const place = filled(person.metPlace);
	const year = yearOf(person.metDate);
	if (place || year) return { kind: 'met', place, year };
	return { kind: 'nothing' };
}

/** Whether a name is shared by more than one person on `people`. */
function sharedNamesOn(people: readonly Distinguishable[]): (displayName: string) => boolean {
	const counts = new Map<string, number>();
	for (const p of people) {
		const key = sameNameKey(p.displayName);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return (displayName) => (counts.get(sameNameKey(displayName)) ?? 0) > 1;
}

/**
 * The people on `people` who share their name with another on it: the only ones a second line
 * is ever drawn for, and so the only ones whose relationships and circles are worth sending.
 */
export function namesakesOn<P extends Distinguishable>(people: readonly P[]): P[] {
	const isShared = sharedNamesOn(people);
	return people.filter((p) => isShared(p.displayName));
}

/**
 * The line a person's relationships or circles give, or null when they give none: the first
 * link whose other end is not a namesake too (*Father of Thomas* tells no Thomas apart), else
 * the circle.
 */
export function contextLineOf(
	context: PersonContext | undefined,
	isSharedName: (displayName: string) => boolean
): Distinction | null {
	if (!context) return null;
	const tie = context.ties.find((t) => !isSharedName(t.otherName));
	if (tie) return { kind: 'tie', tie };
	if (context.circle) return { kind: 'circle', ...context.circle };
	return null;
}

/**
 * The second line for every person on `people` who shares their name with another one on it,
 * by id. Pass the whole list a picker offers, not just what the query left: the name is just
 * as ambiguous when the other Thomas is filtered out of sight. `contexts` holds what the
 * server found the viewer may see of their relationships and circles, by person.
 */
export function tellApart(
	people: readonly Distinguishable[],
	contexts: ReadonlyMap<string, PersonContext> = new Map()
): Map<string, Distinction> {
	const isShared = sharedNamesOn(people);
	const lines = new Map<string, Distinction>();
	for (const p of people) {
		if (!isShared(p.displayName)) continue;
		const typed = distinctionOf(p);
		lines.set(p.id, typed.kind === 'nothing' ? (contextLineOf(contexts.get(p.id), isShared) ?? typed) : typed);
	}
	return lines;
}

/** A description the clean-up list may fill in for someone, from their relationships or circles. */
export function suggestedDescription(
	t: Translate,
	people: readonly Distinguishable[],
	context: PersonContext | undefined
): string | null {
	const line = contextLineOf(context, sharedNamesOn(people));
	return line ? describeDistinction(t, line, { byName: true }) : null;
}

/** Whether nothing typed tells this person apart, so the line would fall back further. */
export function hasNothingTyped(person: Distinguishable): boolean {
	return distinctionOf(person).kind === 'nothing';
}

/**
 * Whether someone is known by a first name alone (docs/02 §2.2.3): no last name, neither in its
 * field nor in the name they are shown by, and nothing for the namesake line to say either. The
 * people the clean-up list gathers, by the same rule that would give them *Nothing yet*.
 */
export function isKnownByAFirstNameOnly(person: Distinguishable): boolean {
	if (filled(person.lastName)) return false;
	if (person.displayName.trim().split(/\s+/).length > 1) return false;
	return hasNothingTyped(person);
}

/** How a link reads from the namesake's end: *Your sibling*, or *Sibling of Andy Brunner*. */
function describeTie(t: Translate, tie: ContextTie, byName: boolean): string {
	const towardsYou = `relationships.towardsYou.${tie.typeKey}.${tie.side}`;
	if (tie.otherIsViewer && !byName && hasMessage(towardsYou)) return t(towardsYou);
	return `${relationshipRowLabel(t, tie)} ${tie.otherName}`;
}

/** The second line in words, in the reader's language — for a component and a refusal alike. */
export function describeDistinction(
	t: Translate,
	distinction: Distinction,
	/** For a description to be stored for everyone: a link to the viewer by their name, not *your*. */
	{ byName = false }: { byName?: boolean } = {}
): string {
	switch (distinction.kind) {
		case 'description':
			return distinction.text;
		case 'met':
			if (distinction.place && distinction.year)
				return t('components.namesake.metPlaceYear', { place: distinction.place, year: distinction.year });
			if (distinction.place) return t('components.namesake.metPlace', { place: distinction.place });
			return t('components.namesake.metYear', { year: distinction.year ?? '' });
		case 'tie':
			return describeTie(t, distinction.tie, byName);
		case 'circle':
			return distinction.role
				? t('components.namesake.circleRole', { circle: distinction.name, role: distinction.role })
				: distinction.name;
		case 'nothing':
			return t('components.namesake.nothing');
	}
}
