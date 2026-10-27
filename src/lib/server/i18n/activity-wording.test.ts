import { describe, expect, it } from 'bun:test';
import { activityWording } from './activity-wording';

describe('activityWording', () => {
	it('writes a restore in the language of the member who ran it', () => {
		expect(activityWording.restored('en', 12, 'Brunner')).toContain('12 people');
		expect(activityWording.restored('en', 1, 'Brunner')).toContain('1 person');
		expect(activityWording.restored('de', 12, 'Brunner')).toBe(
			'12 Menschen aus einem Archiv von Brunner wiederhergestellt'
		);
	});

	it('writes an API import in the language of the member whose token sent it', () => {
		const only = { people: 2, completed: 0, circlesChanged: 0 };
		expect(activityWording.imported('en', only, 'kindergarten')).toBe(
			'imported 2 people through the API (kindergarten)'
		);
		expect(activityWording.imported('de', only, 'kindergarten')).toBe(
			'2 Menschen importiert (über die API, kindergarten)'
		);
	});

	it('names the people an API import completed, with or without new ones', () => {
		expect(
			activityWording.imported('en', { people: 0, completed: 3, circlesChanged: 0 }, 'class')
		).toBe('added contact details to 3 people through the API (class)');
		expect(
			activityWording.imported('de', { people: 18, completed: 1, circlesChanged: 0 }, 'class')
		).toBe('18 Menschen importiert und Kontaktdaten von 1 Person ergänzt (über die API, class)');
	});

	it('names the circles an API import changed, alone or with the rest', () => {
		expect(
			activityWording.imported('en', { people: 0, completed: 0, circlesChanged: 1 }, 'school')
		).toBe('changed 1 circle through the API (school)');
		expect(
			activityWording.imported('en', { people: 1, completed: 2, circlesChanged: 3 }, 'school')
		).toBe(
			'imported 1 person, added contact details to 2 people and changed 3 circles through the API (school)'
		);
		expect(
			activityWording.imported('de', { people: 0, completed: 0, circlesChanged: 3 }, 'school')
		).toBe('3 Kreise geändert (über die API, school)');
	});

	it('writes a matching review with the address book it came from', () => {
		expect(activityWording.reviewed('en', { people: 4, completed: 11 }, 'vcard:google')).toBe(
			'imported 4 people and added contact details to 11 people from a Google export'
		);
		expect(activityWording.reviewed('en', { people: 0, completed: 1 }, 'vcard:other')).toBe(
			'added contact details to 1 person from a vCard file'
		);
		expect(activityWording.reviewed('de', { people: 1, completed: 0 }, 'vcard:nextcloud')).toBe(
			'1 Person importiert (aus einem Nextcloud-Export)'
		);
	});
});
