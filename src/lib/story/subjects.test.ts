import { describe, expect, it } from 'bun:test';
import { faceLookup, othersThan, subjectFacesOf, subjectPool } from './subjects';

const markus = { id: 'markus', displayName: 'Markus', avatarPhotoId: 'p1' };
const lea = { id: 'lea', displayName: 'Lea', avatarPhotoId: null };

describe('subjectFacesOf', () => {
	it('draws the subjects in the entry’s order, leaving out anyone the reader cannot see', () => {
		const faceOf = faceLookup([lea, markus]);
		expect(subjectFacesOf(['markus', 'hidden', 'lea'], faceOf)).toEqual([markus, lea]);
	});
});

describe('othersThan', () => {
	it('leaves out the person whose page it is, so the line names only the others', () => {
		expect(othersThan([markus, lea], 'lea')).toEqual([markus]);
		expect(othersThan([markus], 'markus')).toEqual([]);
	});
});

describe('subjectPool', () => {
	const person = (id: string, visibility: 'shared' | 'private') => ({
		id,
		displayName: id,
		firstName: null,
		lastName: null,
		visibility,
		avatarPhotoId: null
	});
	const candidates = [person('lea', 'shared'), person('tim', 'shared'), person('pia', 'private')];

	it('offers the subjects first, then whom the audience may see, each once', () => {
		expect(subjectPool([markus, lea], candidates, 'shared').map((p) => p.id)).toEqual([
			'markus',
			'lea',
			'tim'
		]);
	});

	it('offers a private person only for a private moment', () => {
		expect(subjectPool([markus], candidates, 'private').map((p) => p.id)).toContain('pia');
	});
});
