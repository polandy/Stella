/*
 * What *Set last name* will do for the people chosen (docs/02 §2.2.4.3), worked
 * out before anything is sent: the blanks are named, a different last name is replaced only
 * when ticked by hand, and the same name — folded, so *Brünner* is *Brunner* — is left alone.
 * With nobody to ask about there is nothing to confirm, so the panel writes straight away.
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
	/** Someone would lose a last name, so the batch is confirmed before it is sent. */
	asks: boolean;
	/** Every one of `different` is ticked — the *Replace all* tick shows checked. */
	replacesAll: boolean;
}

export function planLastName<P extends Chosen>(
	chosen: readonly P[],
	lastName: string,
	replace: Readonly<Record<string, boolean>>
): LastNamePlan<P> {
	const blank = (p: P) => !(p.lastName ?? '').trim();
	const different = chosen.filter(
		(p) => !blank(p) && foldSurname(p.lastName!) !== foldSurname(lastName)
	);
	const replaced = different.filter((p) => replace[p.id]);
	return {
		written: [...chosen.filter(blank), ...replaced],
		different,
		replaceIds: replaced.map((p) => p.id),
		asks: different.length > 0,
		replacesAll: different.length > 0 && replaced.length === different.length
	};
}

/** The ticks after *Replace all*: everyone with a different last name, on or off together. */
export function replaceAll(plan: LastNamePlan<Chosen>, on: boolean): Record<string, boolean> {
	return Object.fromEntries(plan.different.map((p) => [p.id, on]));
}
