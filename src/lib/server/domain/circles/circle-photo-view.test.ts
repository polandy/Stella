import { describe, expect, it } from 'bun:test';
import { circlePhotoView, leadPhoto, matchRoleOption, photoRoleOptions } from './circle-photo-view';

/*
 * What a circle's photos look like on its page (docs/02 §2.4.2): the cover, the banner over
 * each role group, the grid's order, the role chips, and the roles a photo can be given.
 * Pure: photos and the members' roles in, decisions out.
 */

interface Photo {
	id: string;
	role: string | null;
	createdAt: number;
	pinnedAt: number | null;
}
const photo = (id: string, over: Partial<Photo> = {}): Photo => ({
	id,
	role: null,
	createdAt: 1,
	pinnedAt: null,
	...over
});
const ids = (photos: readonly { id: string }[]) => photos.map((p) => p.id);

describe('leadPhoto', () => {
	it('is the newest photo of that role when none is a favourite', () => {
		const photos = [photo('old', { createdAt: 1 }), photo('new', { createdAt: 9 }), photo('other', { role: 'Student', createdAt: 20 })];
		expect(leadPhoto(photos, null)?.id).toBe('new');
	});

	it('is the favourite pinned most recently, however old the photo', () => {
		const photos = [
			photo('newest', { createdAt: 50 }),
			photo('pinned-first', { createdAt: 2, pinnedAt: 60 }),
			photo('pinned-last', { createdAt: 1, pinnedAt: 70 })
		];
		expect(leadPhoto(photos, null)?.id).toBe('pinned-last');
	});

	it('matches the role by its folded key', () => {
		const photos = [photo('s', { role: ' student ' }), photo('n')];
		expect(leadPhoto(photos, 'student')?.id).toBe('s');
	});

	it('is null when the role has no photo', () => {
		expect(leadPhoto([photo('s', { role: 'Student' })], null)).toBeNull();
		expect(leadPhoto([], 'teacher')).toBeNull();
	});
});

describe('circlePhotoView', () => {
	const photos = [
		photo('cover', { createdAt: 5 }),
		photo('older-cover', { createdAt: 1 }),
		photo('kids', { role: 'student', createdAt: 4 }),
		photo('kids-fav', { role: 'Student', createdAt: 2, pinnedAt: 10 }),
		photo('parents', { role: 'Parent', createdAt: 3 })
	];
	const view = circlePhotoView(photos, ['Student', 'Teacher']);

	it('orders the grid favourites first, then newest first', () => {
		expect(ids(view.photos)).toEqual(['kids-fav', 'cover', 'kids', 'parents', 'older-cover']);
	});

	it('labels each photo with the members’ spelling of its role, or its own when nobody has it', () => {
		const label = (id: string) => view.photos.find((p) => p.id === id)?.roleLabel;
		expect(label('kids')).toBe('Student');
		expect(label('parents')).toBe('Parent');
		expect(label('cover')).toBeNull();
		expect(view.photos.find((p) => p.id === 'kids')?.roleKey).toBe('student');
	});

	it('takes the cover from the photos without a role', () => {
		expect(view.cover?.id).toBe('cover');
	});

	it('gives a banner only to a role that has members and a photo', () => {
		expect(Object.keys(view.banners)).toEqual(['student']);
		expect(view.banners.student?.id).toBe('kids-fav');
	});

	it('counts the chips: no role first, then the members’ roles, then roles nobody has any more', () => {
		expect(view.chips).toEqual([
			{ key: null, label: null, count: 2 },
			{ key: 'student', label: 'Student', count: 2 },
			{ key: 'parent', label: 'Parent', count: 1 }
		]);
	});

	it('has no cover, no banners and no chips without photos', () => {
		expect(circlePhotoView([], ['Student'])).toEqual({ photos: [], cover: null, banners: {}, chips: [] });
	});
});

describe('photoRoleOptions', () => {
	it('offers the circle’s current roles', () => {
		expect(photoRoleOptions(['Student', 'Teacher'], null)).toEqual(['Student', 'Teacher']);
	});

	it('keeps the photo’s own role when nobody has it any more', () => {
		expect(photoRoleOptions(['Student'], 'Parent')).toEqual(['Student', 'Parent']);
	});

	it('does not offer the photo’s role twice when it differs only in case', () => {
		expect(photoRoleOptions(['Student'], 'student')).toEqual(['Student']);
	});
});

describe('matchRoleOption', () => {
	const options = ['Student', 'Teacher'];

	it('stores a picked role under the spelling offered', () => {
		expect(matchRoleOption('student', options)).toEqual({ role: 'Student' });
	});

	it('reads blank as no role', () => {
		expect(matchRoleOption('  ', options)).toEqual({ role: null });
		expect(matchRoleOption(null, options)).toEqual({ role: null });
	});

	it('refuses a role that was not offered', () => {
		expect(matchRoleOption('Coach', options)).toBeNull();
	});
});
