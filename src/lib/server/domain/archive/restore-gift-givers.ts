import type { GiftState } from '../../../gifts/gifts';
import { bool, records, str, type Row } from './restore-fields';

/** Who gives a restored gift (§2.25.12): someone the archive brought along, never its own person. */
export function giverOfRestored(
	row: Row,
	state: GiftState,
	recipientId: string,
	knownPeople: ReadonlySet<string>
) {
	// What was received came from its person.
	if (state === 'received') {
		return { giver_contact_id: null, giver_is_household: 0, giver_left_name: null };
	}
	const giver = str(row, 'giver');
	const kept = giver !== null && giver !== recipientId && knownPeople.has(giver) ? giver : null;
	return {
		giver_contact_id: kept,
		giver_is_household: kept === null && bool(row, 'giver_is_household') ? 1 : 0,
		giver_left_name: kept === null ? str(row, 'giver_left_name') : null
	};
}

/**
 * The givers beside a restored gift's first (§2.25.12), in the order they were named: people the
 * archive brought along, each once, never the gift's own person nor its first giver; a deleted
 * giver by the name they left. A gift received names nobody.
 */
export function coGiversOfRestored(
	row: Row,
	state: GiftState,
	giftId: string,
	recipientId: string,
	firstId: string | null,
	knownPeople: ReadonlySet<string>
): Row[] {
	if (state === 'received') return [];
	const seen = new Set<string>([recipientId, ...(firstId === null ? [] : [firstId])]);
	const kept: { contact_id: string | null; left_name: string | null }[] = [];
	for (const entry of records(row, 'co_givers')) {
		const person = str(entry, 'giver');
		if (person === null) {
			const left = str(entry, 'left_name');
			if (left !== null) kept.push({ contact_id: null, left_name: left });
			continue;
		}
		if (seen.has(person) || !knownPeople.has(person)) continue;
		seen.add(person);
		kept.push({ contact_id: person, left_name: null });
	}
	return kept.map((giver, position) => ({ gift_id: giftId, position, ...giver }));
}
