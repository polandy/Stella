import { oneLine, type Housemate } from '../people/home';
import type { CapChoice } from './multi-pick';
import { PARENT_CHILD_TYPE_KEY, PARTNER_TYPE_KEYS } from './type-keys';

/*
 * *Lives at Lindenweg 4 with Anna and Peter* (docs/02 §2.4): a child or partner created right
 * in the relationship form most likely lives where the person whose page it is lives, so that
 * address is offered under the picker, ticked. Taken, the new people move into the home —
 * linked, not copied, so a move later changes one line for all of them (docs/02 §2.2, *A shared
 * home*).
 *
 * Only people created here: someone already in Stella may live anywhere, and their own page
 * has *Also lives here …*. Only one address: with two, which one is meant is not ours to guess.
 */

/** What the form knows when it asks. */
export interface LivesAtInput {
	choice: CapChoice | null;
	pickedIds: readonly string[];
	/** The people the picker created during this form, in the order they were made. */
	createdIds: readonly string[];
	/** The homes the person whose page it is lives in. */
	homes: readonly { id: string; value: string; livesWith: readonly Housemate[] }[];
	/** Their own contact fields, of every kind. */
	fields: readonly { id: string; kind: string; value: string }[];
}

/** The offer as the form shows and posts it. */
export interface LivesAtOffer {
	/** `home:<id>` or `field:<id>`, as *Also lives here …* posts which address is shared. */
	address: string;
	line: string;
	/** Who else lives there already, besides the person whose page it is. */
	livesWith: readonly Housemate[];
	/** The new people who would move in, in the order they were picked. */
	newIds: string[];
}

/** Whether the picked people become the subject's children or partner. */
const movesInWith = (choice: CapChoice) =>
	PARTNER_TYPE_KEYS.includes(choice.type.key) ||
	(choice.type.key === PARENT_CHILD_TYPE_KEY && choice.side === 'forward');

export function livesAtOffer(input: LivesAtInput): LivesAtOffer | null {
	if (!input.choice || !movesInWith(input.choice)) return null;
	const newIds = input.pickedIds.filter((id) => input.createdIds.includes(id));
	if (newIds.length === 0) return null;

	const ownAddresses = input.fields.filter((field) => field.kind === 'address');
	if (input.homes.length + ownAddresses.length !== 1) return null;

	const [home] = input.homes;
	if (home) {
		return {
			address: `home:${home.id}`,
			line: oneLine(home.value),
			livesWith: home.livesWith,
			newIds
		};
	}
	const [field] = ownAddresses;
	return { address: `field:${field.id}`, line: oneLine(field.value), livesWith: [], newIds };
}
