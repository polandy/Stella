import type { Viewer } from '../../access/visibility';

/*
 * Duplicate & relative suggestions (docs/02 §2.2.1). Pure ranking over names: no
 * persistence, no visibility — the caller passes only the people the viewer may see.
 * Deliberately simple matching (normalised equality plus one edit of tolerance) rather
 * than a phonetic scheme: the household is small and false positives cost attention.
 */

/** A person the ranker may propose; `relationshipCount` breaks ties toward well-connected people. */
export interface NameCandidate {
	id: string;
	displayName: string;
	firstName: string | null;
	lastName: string | null;
	relationshipCount: number;
}

/** What is being typed. Nothing is proposed until a surname is present. */
export interface NameInput {
	firstName?: string | null;
	lastName?: string | null;
}

/** Why a person was proposed, strongest first. */
export type MatchReason = 'same-name' | 'same-surname' | 'similar-surname';

export interface RankedCandidate {
	id: string;
	displayName: string;
	reason: MatchReason;
}

/** How many people quick-add shows; more than a handful stops being a suggestion. */
export const SUGGESTION_LIMIT = 5;

/** Surnames shorter than this get no typo tolerance — one edit would match too much. */
const FUZZY_MIN_LENGTH = 4;

const REASON_RANK: Record<MatchReason, number> = { 'same-name': 0, 'same-surname': 1, 'similar-surname': 2 };

/** Lower-case, diacritics stripped, whitespace collapsed. */
function normalise(value: string | null | undefined): string {
	return (value ?? '')
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();
}

/** Parts of a (possibly compound) surname: "müller-brunner" → ["muller", "brunner"]. */
function surnameParts(value: string | null | undefined): string[] {
	return normalise(value)
		.split(/[\s-]+/)
		.filter((part) => part.length > 0);
}

/** Damerau-Levenshtein distance (with adjacent transposition), capped at 2 for cheapness. */
function editDistance(a: string, b: string): number {
	if (Math.abs(a.length - b.length) > 1) return 2;
	const rows = a.length + 1;
	const cols = b.length + 1;
	const d: number[][] = Array.from({ length: rows }, (_, i) => {
		const row = new Array<number>(cols).fill(0);
		row[0] = i;
		return row;
	});
	for (let j = 0; j < cols; j++) d[0]![j] = j;
	for (let i = 1; i < rows; i++) {
		for (let j = 1; j < cols; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			let best = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				best = Math.min(best, d[i - 2]![j - 2]! + 1);
			}
			d[i]![j] = best;
		}
	}
	return d[a.length]![b.length]!;
}

function surnameMatch(typed: string, candidateParts: string[]): 'same' | 'similar' | null {
	if (candidateParts.includes(typed)) return 'same';
	if (typed.length < FUZZY_MIN_LENGTH) return null;
	const similar = candidateParts.some(
		(part) => part.length >= FUZZY_MIN_LENGTH && editDistance(typed, part) <= 1
	);
	return similar ? 'similar' : null;
}

/**
 * The people worth showing next to a name being typed, best first: an exact full-name
 * match (a likely duplicate), then the same surname, then a surname one typo away.
 */
export function rankNameCandidates(
	input: NameInput,
	candidates: readonly NameCandidate[],
	limit: number = SUGGESTION_LIMIT
): RankedCandidate[] {
	const typedSurname = normalise(input.lastName);
	if (typedSurname.length === 0) return [];
	const typedFirst = normalise(input.firstName);

	const ranked: (RankedCandidate & { rank: number; relationshipCount: number })[] = [];
	for (const c of candidates) {
		const match = surnameMatch(typedSurname, surnameParts(c.lastName));
		if (match === null) continue;
		const sameFirst = typedFirst.length > 0 && normalise(c.firstName) === typedFirst;
		const reason: MatchReason =
			match === 'same' ? (sameFirst ? 'same-name' : 'same-surname') : 'similar-surname';
		ranked.push({
			id: c.id,
			displayName: c.displayName,
			reason,
			rank: REASON_RANK[reason],
			relationshipCount: c.relationshipCount
		});
	}

	ranked.sort(
		(a, b) =>
			a.rank - b.rank ||
			b.relationshipCount - a.relationshipCount ||
			a.displayName.localeCompare(b.displayName)
	);
	return ranked.slice(0, limit).map(({ id, displayName, reason }) => ({ id, displayName, reason }));
}

/** Where quick-add's candidates come from: only people the viewer may see (docs/02 §2.10). */
export interface NameCandidateSource {
	listNameCandidatesVisibleTo(viewer: Viewer): Promise<NameCandidate[]>;
}

export interface SuggestionDeps {
	candidates: NameCandidateSource;
}

/** Likely duplicates and relatives for a name being typed, ranked; nothing without a surname. */
export async function suggestNameCandidates(
	deps: SuggestionDeps,
	viewer: Viewer,
	input: NameInput
): Promise<RankedCandidate[]> {
	if (normalise(input.lastName).length === 0) return [];
	return rankNameCandidates(input, await deps.candidates.listNameCandidatesVisibleTo(viewer));
}
