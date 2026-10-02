import type { LinkedPhrase } from '$lib/i18n/linked';
import { foldSurname, type SurnameOption, type SurnameProposal } from './rules/surnames';
import type { Confidence } from './types';

/*
 * The *Last names* list (docs/concepts/surnames.md §3.1): the people without one, grouped by
 * the name Stella proposes, so a family is given its name in one step. Pure: what is proposed
 * was settled by the rules, this only arranges it.
 */

/** One person in a group, ticked when the rule behind it is sure enough to be a default. */
export interface GroupRow {
	personId: string;
	confidence: Confidence;
	reasons: readonly LinkedPhrase[];
	preTicked: boolean;
	/** Lower-ranked names, offered from the row's menu as *or: Weber*. */
	alternatives: readonly string[];
}

/** Everyone proposed the same name (folded), shown in the household's spelling. */
export interface SurnameGroup {
	name: string;
	rows: GroupRow[];
}

/** Someone whose sources disagree at the same confidence; each option is a chip. */
export interface ChooseRow {
	personId: string;
	options: readonly SurnameOption[];
}

export interface SurnameList {
	groups: SurnameGroup[];
	chooseOne: ChooseRow[];
	/** Ids of the people nothing proposes a name for. */
	none: string[];
}

/**
 * The spelling the household uses most for each name, keyed by the folded name — so a group
 * reads *Müller* even when one proposal came from a record typed *Muller*. Ties go to the
 * spelling that sorts first, which keeps the result the same on every run.
 */
export function householdSpellings(lastNames: Iterable<string | null>): Map<string, string> {
	const counts = new Map<string, Map<string, number>>();
	for (const raw of lastNames) {
		const name = (raw ?? '').trim();
		if (!name) continue;
		const folded = foldSurname(name);
		const spellings = counts.get(folded) ?? new Map<string, number>();
		spellings.set(name, (spellings.get(name) ?? 0) + 1);
		counts.set(folded, spellings);
	}
	const chosen = new Map<string, string>();
	for (const [folded, spellings] of counts) {
		const [best] = [...spellings].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
		chosen.set(folded, best![0]);
	}
	return chosen;
}

/** Arranges each person's proposal into the three sections, the largest group first. */
export function groupBySurname(
	entries: readonly { personId: string; proposal: SurnameProposal }[],
	spellings: ReadonlyMap<string, string>
): SurnameList {
	const groups = new Map<string, SurnameGroup>();
	const chooseOne: ChooseRow[] = [];
	const none: string[] = [];
	for (const { personId, proposal } of entries) {
		if (proposal.kind === 'none') none.push(personId);
		else if (proposal.kind === 'choose') chooseOne.push({ personId, options: proposal.options });
		else {
			const folded = foldSurname(proposal.name);
			const group = groups.get(folded) ?? { name: spellings.get(folded) ?? proposal.name, rows: [] };
			group.rows.push({
				personId,
				confidence: proposal.confidence,
				reasons: proposal.reasons,
				preTicked: proposal.confidence !== 'possible',
				alternatives: proposal.alternatives
			});
			groups.set(folded, group);
		}
	}
	const ordered = [...groups.values()].sort((a, b) => b.rows.length - a.rows.length || a.name.localeCompare(b.name));
	return { groups: ordered, chooseOne, none };
}
