import { giverSuggestions } from '#lib/gifts/giver-suggestions.js';
import type { Translate } from '#lib/i18n/translate.js';
import { relationshipRowLabel } from '#lib/relationships/labels.js';
import type { GiverChoices, PersonPageData } from './types';

/** Whom *Wer schenkt?* offers on a person's card: their living links, then the household. */
export function giverChoicesOf(data: PersonPageData, t: Translate): GiverChoices {
	const may = new Set(data.giverTieIds);
	const ties = data.relationships
		.filter((rel) => may.has(rel.otherContactId))
		.map((rel) => ({
			id: rel.otherContactId,
			name: rel.otherDisplayName,
			hint: relationshipRowLabel(t, rel)
		}));
	return {
		...giverSuggestions(data.contact.id, ties, data.householdGivers),
		people: data.people,
		recipientId: data.contact.id
	};
}
