import { describe, expect, it } from 'bun:test';
import type { ContactNameDeps } from '$lib/server/domain/contacts/contact-names';
import type { StreamItem } from '$lib/server/domain/stream/stream';
import { streamForView } from './stream-view';

/*
 * A moment as Home and a tag's page show it (docs/02 §2.22.2, §2.20.2): rendered once, its
 * mentions named only as far as the viewer may see, its tags leading to the tag's page.
 */

const viewer = { id: 'u1', householdId: 'h1' };
const deps: ContactNameDeps = {
	contactNames: {
		listNamesAmongVisibleTo: async (_viewer, ids) =>
			ids.filter((id) => id === 'lena').map((id) => ({ id, displayName: 'Lena' }))
	}
} as ContactNameDeps;

const moment = (body: string): StreamItem => ({
	kind: 'moment',
	mine: true,
	id: 'm1',
	at: 1,
	actor: { id: 'u1', name: 'One' },
	anchor: { id: 'anna', name: 'Anna', avatarPhotoId: null },
	entryDate: '2026-10-29',
	visibility: 'shared',
	body,
	mentions: [],
	photoIds: []
});

describe('streamForView', () => {
	it("links a moment's tag to its page and names only the people the viewer may see", async () => {
		const [view] = await streamForView(deps, viewer, [
			moment('With @{contact:lena} and @{contact:secret} up the #Gurten.')
		]);
		if (view.kind !== 'moment') throw new Error('expected a moment');
		expect(view.bodyHtml).toContain('href="/tags/gurten"');
		expect(view.bodyHtml).toContain('Lena');
		expect(view.bodyHtml).not.toContain('secret');
		expect(view.body).toBeUndefined();
	});
});
