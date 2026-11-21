import { describe, expect, it } from 'bun:test';
import { NO_GIVER, type OpenIdea } from '#lib/server/domain/gifts/gifts.js';
import { openIdeaView } from './idea-view';

const idea: OpenIdea & { whenState: null } = {
	id: 'g-1',
	...NO_GIVER,
	storedAt: null,
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
	when: null,
	whenCheckedOn: null,
	groupId: null,
	hiddenFromRecipient: false,
	whenState: null,
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
			when: null,
			whenState: null,
			hiddenFromRecipient: false,
			mine: false,
			notedBy: 'Sandra',
			group: null
		});
	});

	it('names everyone else a group’s idea is for, linked to its panel (§2.25.11)', () => {
		const grouped = { ...idea, groupId: 'gg' };
		const group = {
			id: 'gg',
			members: [
				{ contactId: 'c-1', name: 'Hilde Brunner' },
				{ contactId: 'c-2', name: 'Ben Brunner' }
			]
		};
		expect(openIdeaView(grouped, 'u-1', names, [group]).group).toEqual({
			names: ['Ben Brunner'],
			href: '/contacts/c-1?group=gg#section-gifts'
		});
		expect(openIdeaView(grouped, 'u-1', names, []).group).toBeNull();
	});

	it('says nothing more of the viewer’s own idea than that it is theirs', () => {
		expect(openIdeaView(idea, 'u-2', names)).toMatchObject({ mine: true, notedBy: null });
	});

	it('names nobody once the member who noted it has left', () => {
		expect(openIdeaView({ ...idea, createdBy: 'u-gone' }, 'u-1', names).notedBy).toBeNull();
	});
});
