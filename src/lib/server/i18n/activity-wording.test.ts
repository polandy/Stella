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
		const only = { people: 2, completed: 0 };
		expect(activityWording.imported('en', only, 'kindergarten')).toContain('kindergarten');
		expect(activityWording.imported('de', only, 'kindergarten')).toBe(
			'2 Menschen über die API importiert (kindergarten)'
		);
	});

	it('names the people an API import completed, with or without new ones', () => {
		expect(activityWording.imported('en', { people: 0, completed: 3 }, 'class')).toBe(
			'added contact details to 3 people through the API (class)'
		);
		expect(activityWording.imported('de', { people: 18, completed: 1 }, 'class')).toBe(
			'18 Menschen über die API importiert und Kontaktdaten von 1 Person ergänzt (class)'
		);
	});
});
