import type { ContactSource } from '../../../import-match/card';
import { readCategories, type Property } from './vcard-lines';

/** Where a file comes from, read from the file itself (docs/02 §2.16.2). */
export type VCardSource = ContactSource;

/** Google's own groups: every contact is in `myContacts`, a starred one also in `starred`. */
const GOOGLE_GROUPS = ['myContacts', 'starred'];

const NEXTCLOUD_PRODID = /sabre|nextcloud/i;
const GOOGLE_PHOTO = /googleusercontent\.com/i;

export function detectSource(cards: Property[][]): VCardSource {
	const has = (card: Property[], name: string) => card.some((p) => p.name === name);
	if (cards.some((c) => c.some((p) => p.name === 'PRODID' && NEXTCLOUD_PRODID.test(p.raw)))) {
		return 'vcard:nextcloud';
	}
	const looksGoogle = (card: Property[]) =>
		!has(card, 'UID') &&
		(has(card, 'X-ABLABEL') ||
			readCategories(card).some((c) => GOOGLE_GROUPS.includes(c)) ||
			card.some((p) => p.name === 'PHOTO' && GOOGLE_PHOTO.test(p.raw)));
	return cards.some(looksGoogle) ? 'vcard:google' : 'vcard:other';
}

/** The categories that are the member's own groups — Google's are not, and become no tag. */
export const ownCategories = (card: Property[], source: VCardSource): string[] =>
	readCategories(card).filter((c) => source !== 'vcard:google' || !GOOGLE_GROUPS.includes(c));
