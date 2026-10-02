import { describe, expect, it } from 'bun:test';
import { readCutForm } from './cut-form';

/* The form a profile picture cut from a group photo arrives in (docs/concepts/circle-photos.md §5). */

function form(over: Record<string, string | null> = {}) {
	const f = new FormData();
	const fields = { photoId: 'class', contactId: 'anna', cropX: '120.5', cropY: '40', cropSize: '300', width: '1024', height: '1024', ...over };
	for (const [key, value] of Object.entries(fields)) if (value !== null) f.set(key, value);
	f.set('image', new File([new Uint8Array([1, 2])], 'a.jpg'));
	f.set('thumb', new File([new Uint8Array([3])], 't.jpg'));
	return f;
}

describe('readCutForm', () => {
	it('reads the photo, the person, the square and its rendering', async () => {
		expect(await readCutForm(form())).toEqual({
			photoId: 'class',
			contactId: 'anna',
			crop: { x: 120.5, y: 40, size: 300 },
			upload: { image: new Uint8Array([1, 2]), thumb: new Uint8Array([3]), width: 1024, height: 1024 }
		});
	});

	it('refuses a form without a person, a square or its bytes', async () => {
		expect(await readCutForm(form({ contactId: null }))).toBeNull();
		expect(await readCutForm(form({ cropX: 'left' }))).toBeNull();
		const noImage = form();
		noImage.delete('image');
		expect(await readCutForm(noImage)).toBeNull();
	});
});
