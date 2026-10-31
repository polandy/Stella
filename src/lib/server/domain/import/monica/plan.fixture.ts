import type { SourceExport } from './monica-export';
import type { ImportOptions } from './plan';
import { englishWording } from './wording.fixture';

/* The export and options the plan specs start from (docs/02 §2.16). */

export const NOW = 1_700_000_000_000;
export const opts: ImportOptions = {
	householdId: 'h1',
	userId: 'u1',
	visibility: 'shared',
	now: NOW,
	locale: 'en',
	wording: englishWording
};

export function emptyExport(): SourceExport {
	return {
		source: 'sql',
		contacts: [],
		genders: [
			{ id: 1, type: 'M', name: 'Männlich' },
			{ id: 2, type: 'F', name: 'Weiblich' },
			{ id: 3, type: 'O', name: 'Möchte ich nicht angeben' }
		],
		specialDates: [],
		relationshipTypes: [
			{ id: 8, name: 'parent', nameReverse: 'child' },
			{ id: 9, name: 'child', nameReverse: 'parent' },
			{ id: 10, name: 'sibling', nameReverse: 'sibling' },
			{ id: 15, name: 'cousin', nameReverse: 'cousin' },
			{ id: 13, name: 'uncle', nameReverse: 'nephew' },
			{ id: 14, name: 'nephew', nameReverse: 'uncle' },
			{ id: 16, name: 'godfather', nameReverse: 'godson' },
			{ id: 17, name: 'godson', nameReverse: 'godfather' },
			{ id: 20, name: 'bestfriend', nameReverse: 'bestfriend' },
			{ id: 99, name: 'Skipartner', nameReverse: 'Skipartner' }
		],
		relationships: [],
		contactFieldTypes: [
			{ id: 1, name: 'Email', type: 'email', protocol: 'mailto:' },
			{ id: 2, name: 'Phone', type: 'phone', protocol: 'tel:' },
			{ id: 5, name: 'Whatsapp', type: null, protocol: 'https://wa.me/' },
			{ id: 6, name: 'Adresse', type: null, protocol: null }
		],
		contactFields: [],
		addresses: [],
		notes: [],
		activities: [],
		tags: [],
		photos: [],
		gifts: [],
		tasks: [],
		lifeEvents: [],
		pets: [],
		journalEntries: [],
		userCount: 2,
		derivedReminderCount: 0
	};
}

export const contact = (
	id: number,
	first: string,
	last: string | null,
	extra: Partial<SourceExport['contacts'][0]> = {}
) => ({
	id,
	firstName: first,
	middleName: null,
	lastName: last,
	nickname: null,
	genderId: 1,
	description: null,
	isPartial: false,
	isDead: false,
	deceasedSpecialDateId: null,
	birthdaySpecialDateId: null,
	firstMetSpecialDateId: null,
	firstMetThroughContactId: null,
	firstMetWhere: null,
	firstMetAdditionalInfo: null,
	job: null,
	company: null,
	avatarSource: 'default',
	avatarPhotoId: null,
	deletedAt: null,
	createdAt: '2023-06-14 22:24:24',
	...extra
});
