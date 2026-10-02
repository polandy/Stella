/*
 * What *Set last name* will do for the people chosen (docs/concepts/surnames.md §3.2), worked
 * out before anything is sent: the blanks are named, a different last name is replaced only
 * when ticked by hand, and the same name — folded, so *Brünner* is *Brunner* — is left alone.
 */
import { foldSurname } from '$lib/suggestions/rules/surnames';

interface Chosen {
	id: string;
	displayName: string;
	lastName: string | null;
}

export interface LastNamePlan<P extends Chosen> {
	/** Everyone the batch will write, in the order chosen, the ticked replacements last. */
	written: P[];
	/** Those who already have a different last name, to be asked about. */
	different: P[];
	/** Those of `different` ticked to have theirs replaced. */
	replaceIds: string[];
}

export function planLastName<P extends Chosen>(
	chosen: readonly P[],
	lastName: string,
	replace: Readonly<Record<string, boolean>>
): LastNamePlan<P> {
	const blank = (p: P) => !(p.lastName ?? '').trim();
	const different = chosen.filter((p) => !blank(p) && foldSurname(p.lastName!) !== foldSurname(lastName));
	const replaced = different.filter((p) => replace[p.id]);
	return {
		written: [...chosen.filter(blank), ...replaced],
		different,
		replaceIds: replaced.map((p) => p.id)
	};
}
