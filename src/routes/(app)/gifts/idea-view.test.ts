import { describe, expect, it } from 'bun:test';
import type { OpenIdea } from '$lib/server/domain/gifts/gifts';
import { openIdeaView } from './idea-view';

const idea: OpenIdea = {
	id: 'g-1',
	contactId: 'c-1',
	contactName: 'Hilde Brunner',
	avatarPhotoId: 'p-1',
	createdBy: 'u-2',
	visibility: 'shared',
	state: 'idea',
	title: 'Teapot',
	note: 'The black one',
	url: 'https://shop.example',
	givenOn: null,
	occasion: null,
	createdAt: 1,
	updatedAt: 1
};
const names = (id: string) => (id === 'u-2' ? 'Sandra Brunner' : null);

describe('openIdeaView', () => {
	it('names who noted it by first name', () => {
		expect(openIdeaView(idea, 'u-1', names)).toEqual({
			id: 'g-1',
			contactId: 'c-1',
			contactName: 'Hilde Brunner',
			avatarPhotoId: 'p-1',
			title: 'Teapot',
			note: 'The black one',
			url: 'https://shop.example',
			visibility: 'shared',
			mine: false,
			notedBy: 'Sandra'
		});
	});

	it('says nothing more of the viewer’s own idea than that it is theirs', () => {
		expect(openIdeaView(idea, 'u-2', names)).toMatchObject({ mine: true, notedBy: null });
	});

	it('names nobody once the member who noted it has left', () => {
		expect(openIdeaView({ ...idea, createdBy: 'u-gone' }, 'u-1', names).notedBy).toBeNull();
	});
});
