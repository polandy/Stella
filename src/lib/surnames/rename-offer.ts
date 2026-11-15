import { foldSurname } from '$lib/suggestions/rules/surnames';

/*
 * Correcting a last name (docs/dev/02 §2.2.4.7), on the screen's side: the profile is handed the
 * person's family who carry a last name, and this decides whom it offers a changed name to —
 * those who still carry the old one, folded, so a family name typed wrong is put right for all
 * of them in one confirmed step. A first name given passes on instead (`pass-on.ts`).
 */

/** A relative with a last name, and the names the household declined for them, folded. */
export interface NamedKin {
	id: string;
	name: string;
	lastName: string;
	declined: readonly string[];
}

export function renameOffer(
	family: readonly NamedKin[],
	from: string,
	to: string
): { id: string; name: string }[] {
	const [before, after] = [from.trim(), to.trim()];
	if (!before || !after || before === after) return [];
	const folded = foldSurname(before);
	return family
		.filter(
			(kin) =>
				foldSurname(kin.lastName) === folded &&
				kin.lastName.trim() !== after &&
				!kin.declined.includes(foldSurname(after))
		)
		.map(({ id, name }) => ({ id, name }));
}
