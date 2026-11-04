import { isCommandType } from '../../../commands/commands';
import { RELATIONS } from '../../../suggestions/types';
import { isImmichId } from '../immich/gateway';
import { ms, records, str, type Row } from './restore-fields';

/*
 * Reading back what the household has already answered (docs/02 §2.15): the Immich faces it
 * set aside, the address-book cards it linked or skipped, the suggestions it declined and the
 * commands it applied. Part of `planRestore`, and pure like it — the document in, rows out.
 * Left out, each is a question a restore would ask again, or a resend it would apply twice.
 */

/** What these lists can find wrong with a row, as `RestoreWarning` codes. */
export type AnswerWarning =
	| { code: 'immichNameIgnoreIncomplete' }
	| { code: 'addressBookCardIncomplete' }
	| { code: 'suggestionDismissalIncomplete' }
	| { code: 'commandReceiptIncomplete' };

export interface AnswersContext {
	householdId: string;
	/** The member a row names, if they are here; otherwise the importing admin. */
	author: (row: Row, key: string) => string;
	/** The people the plan restores; a card can only be linked to one of them. */
	knownPeople: ReadonlySet<string>;
	now: number;
	warn: (warning: AnswerWarning) => void;
}

export interface AnswerRows {
	immichNameIgnores: Row[];
	sourceLinks: Row[];
	dismissals: Row[];
	receipts: Row[];
}

/** The address books Stella reads cards from (`ContactSource`). */
const isContactSource = (value: string | null): value is string =>
	value === 'vcard:google' ||
	value === 'vcard:nextcloud' ||
	value === 'vcard:other' ||
	(value !== null && value.startsWith('nextcloud:') && value.length > 'nextcloud:'.length);

/** What a declined suggestion can be about (`suggestion_dismissal.relation`). */
const DISMISSABLE: ReadonlySet<string> = new Set([...RELATIONS, 'last_name', 'same_address']);

/** Whether `text` parses: a resend reads the stored result back with `JSON.parse`. */
function isJson(text: string): boolean {
	try {
		JSON.parse(text);
		return true;
	} catch {
		return false;
	}
}

export function planAnswers(document: Row, ctx: AnswersContext): AnswerRows {
	const { householdId, author, now, warn } = ctx;

	// Refused on the same terms as a link to Immich: the id travels into Immich's URL paths.
	const immichNameIgnores: Row[] = [];
	for (const ignored of records(document, 'immich_names_ignored')) {
		const immichPersonId = str(ignored, 'person');
		if (!isImmichId(immichPersonId)) {
			warn({ code: 'immichNameIgnoreIncomplete' });
			continue;
		}
		immichNameIgnores.push({
			household_id: householdId,
			immich_person_id: immichPersonId,
			ignored_by: author(ignored, 'ignored_by'),
			ignored_at: ms(ignored, 'ignored_at') ?? now
		});
	}

	const sourceLinks: Row[] = [];
	for (const card of records(document, 'address_book_cards')) {
		const source = str(card, 'source');
		const externalUid = str(card, 'card');
		const state = str(card, 'state');
		const cardName = str(card, 'name');
		const cardHash = str(card, 'hash');
		// A link names its person and a skip names nobody — the table's own check.
		const person = state === 'linked' ? str(card, 'person') : null;
		const linkable = state === 'skipped' || (person !== null && ctx.knownPeople.has(person));
		if (
			!isContactSource(source) ||
			externalUid === null ||
			cardName === null ||
			cardHash === null ||
			!linkable
		) {
			warn({ code: 'addressBookCardIncomplete' });
			continue;
		}
		sourceLinks.push({
			household_id: householdId,
			source,
			external_uid: externalUid,
			contact_id: person,
			state,
			card_name: cardName,
			card_hash: cardHash,
			answered_by: author(card, 'answered_by'),
			answered_at: ms(card, 'answered_at') ?? now
		});
	}

	// The pair names people by id, but it is a key, not a reference: a declined claim about
	// someone the archive does not hold is never asked again either way, so it stays.
	const dismissals: Row[] = [];
	for (const declined of records(document, 'declined_suggestions')) {
		const id = str(declined, 'id');
		const relation = str(declined, 'relation');
		const pairKey = str(declined, 'pair');
		if (id === null || relation === null || !DISMISSABLE.has(relation) || pairKey === null) {
			warn({ code: 'suggestionDismissalIncomplete' });
			continue;
		}
		dismissals.push({
			id,
			household_id: householdId,
			relation,
			pair_key: pairKey,
			dismissed_by: author(declined, 'declined_by'),
			dismissed_at: ms(declined, 'declined_at') ?? now
		});
	}

	/*
	 * Only an applied command: its receipt answers a resend with the result it had. One still
	 * pending at the export was inside its handler, and is left out without a warning, so a
	 * resend applies it here. A receipt whose member is not here goes to the admin; a resend
	 * from another member is then refused as a reused id, never applied a second time.
	 */
	const receipts: Row[] = [];
	for (const receipt of records(document, 'command_receipts')) {
		if (str(receipt, 'status') === 'pending') continue;
		const id = str(receipt, 'id');
		const type = str(receipt, 'type');
		if (id === null || !isCommandType(type) || str(receipt, 'status') !== 'applied') {
			warn({ code: 'commandReceiptIncomplete' });
			continue;
		}
		const result = str(receipt, 'result');
		if (result !== null && !isJson(result)) {
			warn({ code: 'commandReceiptIncomplete' });
			continue;
		}
		const claimedAt = ms(receipt, 'claimed_at') ?? now;
		receipts.push({
			id,
			household_id: householdId,
			member_id: author(receipt, 'member'),
			type,
			status: 'applied',
			result,
			claimed_at: claimedAt,
			completed_at: ms(receipt, 'completed_at') ?? claimedAt
		});
	}

	return { immichNameIgnores, sourceLinks, dismissals, receipts };
}
