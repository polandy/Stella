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
		expect(activityWording.imported('en', 2, 'kindergarten')).toContain('kindergarten');
		expect(activityWording.imported('de', 2, 'kindergarten')).toBe(
			'2 Menschen über die API importiert (kindergarten)'
		);
	});
});
